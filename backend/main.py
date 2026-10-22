from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sqlite3
import subprocess
import shutil
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, AsyncIterator, Literal

from fastapi import FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_PATH = Path(os.environ.get("MISSION_DB_PATH", "./mission.db")).expanduser()
HERMES_HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes")).expanduser()
HERMES_BIN: str = shutil.which("hermes") or str(Path.home() / ".local" / "bin" / "hermes")

TaskStatus = Literal["planning", "queued", "active", "blocked", "done"]
STATUSES = {"planning", "queued", "active", "blocked", "done"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with connect_db() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL DEFAULT 'local' CHECK(type IN ('local','github')),
            local_path TEXT NOT NULL,
            github_repo TEXT,
            github_url TEXT,
            description TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'planning' CHECK(status IN ('planning','queued','active','blocked','done')),
            profile TEXT,
            project_id INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
        )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS executions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed','cancelled')),
            exit_code INTEGER,
            output TEXT NOT NULL DEFAULT '',
            started_at TEXT NOT NULL,
            finished_at TEXT,
            FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS prds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL UNIQUE,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            qa_history TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','reviewed','approved')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS task_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            profile_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'contributor',
            reason TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            UNIQUE(task_id, profile_name)
        )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS task_plan_analyses (
            task_id INTEGER PRIMARY KEY,
            analysis_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status_updated ON tasks(status, updated_at DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_id ON events(id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_executions_task ON executions(task_id, started_at DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_prds_task ON prds(task_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_assignments_task ON task_assignments(task_id)")
        conn.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Hermes Mission Control API", version="0.1.0", lifespan=lifespan)

allowed_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Last-Event-ID"],
)


class TaskCreate(BaseModel):
    title: str | None = Field(default=None, max_length=240)  # Optional: auto-generated if not provided
    description: str = Field(default="", max_length=10000)   # Required: main task description
    profile: str | None = Field(default=None, max_length=120)
    project_id: int | None = None
    project_mode: Literal["existing", "new"] = "existing"
    new_project_name: str | None = Field(default=None, max_length=120)

    @field_validator("description")
    @classmethod
    def description_not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("description is required")
        return stripped

    @field_validator("profile")
    @classmethod
    def normalize_profile(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class TaskResponse(BaseModel):
    id: int
    title: str
    description: str
    status: TaskStatus
    profile: str | None
    project_id: int | None
    created_at: str
    updated_at: str


class EventResponse(BaseModel):
    id: int
    task_id: int
    kind: str
    message: str
    created_at: str


class ProfileResponse(BaseModel):
    name: str
    path: str
    has_soul: bool
    is_default: bool = False


class QAPair(BaseModel):
    question: str
    answer: str


class TechChoice(BaseModel):
    category: str  # frontend, backend, database, api, auth
    option: str  # selected option name
    reason: str  # why this option was chosen
    description: str = ""  # brief explanation


class TechAnalysis(BaseModel):
    task_summary: str
    tech_stack: list[TechChoice]
    recommended_profiles: list[str]
    estimated_complexity: str  # simple, moderate, complex
    estimated_duration: str  # hours estimate


class TechChoicesSubmit(BaseModel):
    tech_stack: list[TechChoice]


class PRDCreate(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    content: str = Field(default="", max_length=50000)
    qa_history: list[QAPair] = Field(default_factory=list)


class PRDResponse(BaseModel):
    id: int
    task_id: int
    title: str
    content: str
    qa_history: list[QAPair]
    status: str
    created_at: str
    updated_at: str


class TaskAssignmentCreate(BaseModel):
    profile_name: str = Field(min_length=1, max_length=120)
    role: str = Field(default="contributor", max_length=50)
    reason: str = Field(default="", max_length=500)


class TaskAssignmentResponse(BaseModel):
    id: int
    task_id: int
    profile_name: str
    role: str
    reason: str
    created_at: str


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: Literal["local", "github"] = "local"
    local_path: str = Field(default="", max_length=500)
    github_repo: str | None = Field(default=None, max_length=200)
    github_url: str | None = Field(default=None, max_length=500)
    description: str = Field(default="", max_length=500)

    @field_validator("local_path")
    @classmethod
    def validate_local_path(cls, v: str) -> str:
        return v.strip()


class ProjectResponse(BaseModel):
    id: int
    name: str
    type: str
    local_path: str
    github_repo: str | None
    github_url: str | None
    description: str
    created_at: str
    updated_at: str


class GitHubRepoSync(BaseModel):
    """Response from syncing GitHub repos."""
    repos: list[dict]
    imported: int
    skipped: int


def row_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def read_soul_md(profile_path: str) -> str:
    """Read SOUL.md content from profile directory."""
    soul_file = Path(profile_path) / "SOUL.md"
    if soul_file.exists():
        return soul_file.read_text(encoding="utf-8")
    return ""


def get_profile_soul_and_skills(profile_name: str) -> tuple[str, list[str]]:
    """Get SOUL.md content and list of skills for a profile."""
    if profile_name == "default":
        profile_path = HERMES_HOME
    else:
        profile_path = HERMES_HOME / "profiles" / profile_name
    
    soul_content = read_soul_md(str(profile_path))
    
    skills_dir = profile_path / "skills"
    skills = []
    if skills_dir.exists():
        skills = [d.name for d in skills_dir.iterdir() if d.is_dir() and not d.name.startswith(".")]
    
    return soul_content, skills


class TechStackSelectionItem(BaseModel):
    category_id: str
    category_title: str
    selected_option_id: str
    selected_option_name: str
    option_description: str = ""


class SubmitTechChoicesPayload(BaseModel):
    choices: dict[str, str] = Field(default_factory=dict)
    notes: str = Field(default="", max_length=2000)


def build_tech_stack_catalog(task_title: str, task_description: str) -> list[dict]:
    """Build guided, beginner-friendly tech choices tailored to the task."""
    text = f"{task_title} {task_description}".lower()
    
    is_mobile = any(k in text for k in ["mobile", "android", "ios", "apk", "flutter", "react native"])
    is_payment = any(k in text for k in ["payment", "bayar", "transaksi", "checkout", "stripe", "midtrans", "duitku", "xendit", "qris", "gateway"])
    is_ai_bot = any(k in text for k in ["ai", "bot", "llm", "agent", "telegram", "chat", "whatsapp", "rag"])

    # 1. Frontend / UI
    if is_mobile:
        fe_options = [
            {
                "id": "android_kotlin",
                "name": "Android Native (Kotlin)",
                "description": "Performa paling halus dan akses sensor hardware maksimal langsung di perangkat Android.",
                "recommended": True,
                "badge": "Pilihan Native"
            },
            {
                "id": "react_native",
                "name": "React Native (Expo / TS)",
                "description": "Satu basis kode JavaScript yang bisa dijalankan sekaligus di Android dan iPhone.",
                "recommended": False
            },
            {
                "id": "flutter",
                "name": "Flutter (Dart)",
                "description": "UI konsisten piksel-demi-piksel dengan mesin rendering Google.",
                "recommended": False
            }
        ]
        fe_default = "android_kotlin"
        fe_desc = "Tampilan antarmuka yang dipasang dan dijalankan langsung di layar smartphone."
    else:
        fe_options = [
            {
                "id": "react_vite",
                "name": "React + Vite (TypeScript)",
                "description": "Standar industri modern: build super cepat, kaya komponen siap pakai, dan mudah diintegrasikan.",
                "recommended": True,
                "badge": "Paling Direkomendasikan"
            },
            {
                "id": "nextjs",
                "name": "Next.js (React Full-Stack)",
                "description": "Cocok jika web butuh SEO Google maksimal dan halaman yang di-render di sisi server.",
                "recommended": False
            },
            {
                "id": "html_tailwind",
                "name": "HTML5 + Tailwind CSS Modern",
                "description": "Ringan dan sederhana tanpa dependensi rumit, cocok untuk landing page cepat.",
                "recommended": False
            }
        ]
        fe_default = "react_vite"
        fe_desc = "Bagian visual yang dilihat, diklik, dan dioperasikan langsung oleh pengguna melalui browser."

    # 2. Backend Engine
    be_options = [
        {
            "id": "fastapi_python",
            "name": "FastAPI (Python)",
            "description": "Sangat cepat, otomatis membuatkan halaman dokumentasi interaktif (Swagger), dan mudah dikembangkan pemula.",
            "recommended": True,
            "badge": "Mudah & Terstruktur"
        },
        {
            "id": "express_nodejs",
            "name": "Express.js (Node.js)",
            "description": "Menggunakan bahasa JavaScript yang sama persis dengan frontend. Komunitas paket npm sangat melimpah.",
            "recommended": False
        },
        {
            "id": "go_gin",
            "name": "Go (Gin Framework)",
            "description": "Sangat hemat memori RAM dan super cepat, sangat tangguh menangani ribuan transaksi bersamaan.",
            "recommended": False
        }
    ]
    be_default = "fastapi_python"

    # 3. Database
    db_options = [
        {
            "id": "sqlite",
            "name": "SQLite (Zero-Config File)",
            "description": "Seluruh data tersimpan rapi dalam satu file. Tidak butuh setup server database yang memusingkan.",
            "recommended": not is_payment,
            "badge": "Pemula Friendly" if not is_payment else None
        },
        {
            "id": "postgresql",
            "name": "PostgreSQL (Relational SQL)",
            "description": "Standar emas data relasional. Menjamin integritas data transaksi dan catatan keuangan secara mutlak.",
            "recommended": is_payment,
            "badge": "Standar Keuangan" if is_payment else None
        },
        {
            "id": "mysql",
            "name": "MySQL / MariaDB",
            "description": "Sistem basis data terpopuler di berbagai web hosting konvensional.",
            "recommended": False
        }
    ]
    db_default = "postgresql" if is_payment else "sqlite"

    # 4. API Protocol
    api_options = [
        {
            "id": "rest_json",
            "name": "REST API (JSON Standard)",
            "description": "Protokol standar HTTP paling universal. Sangat mudah dipelajari, dites via curl, dan dihubungkan ke UI.",
            "recommended": True,
            "badge": "Standar Universal"
        },
        {
            "id": "rest_sse",
            "name": "REST API + Server-Sent Events (Real-Time)",
            "description": "REST biasa ditambah jalur khusus untuk mengirim pembaruan status langsung detik itu juga tanpa refresh.",
            "recommended": False
        }
    ]
    api_default = "rest_json"

    # 5. Auth / Security
    auth_options = [
        {
            "id": "jwt_token",
            "name": "JWT Token (Bearer Authentication)",
            "description": "Sistem tiket login digital yang aman dan stateless, sangat cocok untuk aplikasi web modern dan mobile.",
            "recommended": True,
            "badge": "Aman & Praktis"
        },
        {
            "id": "session_cookie",
            "name": "Session Cookie (Browser Classic)",
            "description": "Sistem login berbasis cookie yang langsung tersimpan otomatis di browser pengguna.",
            "recommended": False
        },
        {
            "id": "no_auth",
            "name": "Tanpa Login (Internal / Akses Bebas)",
            "description": "Tidak ada sistem login. Cocok untuk prototipe cepat atau dashboard internal jaringan tertutup.",
            "recommended": False
        }
    ]
    auth_default = "jwt_token"

    categories = [
        {
            "id": "frontend",
            "title": "Frontend",
            "description": fe_desc,
            "options": fe_options,
            "selected": fe_default,
        },
        {
            "id": "backend",
            "title": "Backend",
            "description": "Otak di balik layar yang memvalidasi data, menjalankan perhitungan bisnis, dan menjaga keamanan.",
            "options": be_options,
            "selected": be_default,
        },
        {
            "id": "database",
            "title": "Database",
            "description": "Pondasi tempat menyimpan akun pengguna, konfigurasi, dan semua rekaman riwayat secara permanen.",
            "options": db_options,
            "selected": db_default,
        },
        {
            "id": "api_protocol",
            "title": "API",
            "description": "Format perantara yang mengatur cara frontend dan backend saling bertukar data.",
            "options": api_options,
            "selected": api_default,
        },
        {
            "id": "auth",
            "title": "Autentikasi",
            "description": "Pengatur izin agar hanya pihak berwenang yang bisa mengakses atau mengubah data tertentu.",
            "options": auth_options,
            "selected": auth_default,
        },
    ]

    # 6. Payment if relevant
    if is_payment:
        pay_options = [
            {
                "id": "midtrans",
                "name": "Midtrans Snap (Indonesia Payment Gateway)",
                "description": "Mendukung QRIS, Virtual Account BCA/Mandiri/BRI, dan E-Wallet (GoPay, ShopeePay) dengan verifikasi notifikasi webhook otomatis.",
                "recommended": True,
                "badge": "Lokal Indonesia"
            },
            {
                "id": "xendit",
                "name": "Xendit Payment Gateway",
                "description": "Gateway pembayaran modern dengan dokumentasi API bersih dan dukungan transfer otomatis.",
                "recommended": False
            },
            {
                "id": "stripe",
                "name": "Stripe International",
                "description": "Standar pembayaran internasional untuk kartu kredit dan transaksi multi-mata uang global.",
                "recommended": False
            }
        ]
        categories.append({
            "id": "payment_gateway",
            "title": "Payment Gateway",
            "description": "Konektor resmi untuk memproses transaksi uang, verifikasi invoice otomatis, dan QRIS.",
            "options": pay_options,
            "selected": "midtrans",
        })

    return categories


def analyze_task_for_profiles(task_title: str, task_description: str) -> dict[str, str]:
    """
    Analyze task and match with available profiles based on SOUL.md keywords.
    Returns dict of {profile_name: reason_for_assignment}
    """
    all_profiles = list_profiles()
    task_text = f"{task_title} {task_description}".lower()
    
    assignments: dict[str, str] = {}
    
    for profile in all_profiles:
        if not profile["has_soul"]:
            continue
        
        soul_content, skills = get_profile_soul_and_skills(profile["name"])
        soul_lower = soul_content.lower()
        
        # Simple keyword matching: look for backend/frontend/devops keywords in SOUL and task
        keywords_backend = {"backend", "api", "server", "database", "python", "go", "java", "rust"}
        keywords_frontend = {"frontend", "react", "vue", "typescript", "ui", "ux", "design"}
        keywords_devops = {"devops", "infra", "deployment", "docker", "kubernetes", "terraform"}
        keywords_payment = {"payment", "stripe", "midtrans", "gateway", "transaction", "billing"}
        
        score = 0
        matched_keywords = []
        
        if any(kw in task_text for kw in keywords_backend) and any(kw in soul_lower for kw in keywords_backend):
            score += 2
            matched_keywords.append("backend")
        if any(kw in task_text for kw in keywords_frontend) and any(kw in soul_lower for kw in keywords_frontend):
            score += 2
            matched_keywords.append("frontend")
        if any(kw in task_text for kw in keywords_devops) and any(kw in soul_lower for kw in keywords_devops):
            score += 2
            matched_keywords.append("devops")
        if any(kw in task_text for kw in keywords_payment) and any(kw in soul_lower for kw in keywords_payment):
            score += 3
            matched_keywords.append("payment-specialist")
        
        if score > 0:
            reason = f"Matched keywords: {', '.join(matched_keywords)}. Profile has skills in: {', '.join(skills[:3])}"
            assignments[profile["name"]] = reason
    
    return assignments


def publish_event(task_id: int, kind: str, message: str) -> EventResponse:
    now = utc_now()
    with connect_db() as conn:
        cursor = conn.execute(
            "INSERT INTO events (task_id, kind, message, created_at) VALUES (?, ?, ?, ?)",
            (task_id, kind, message, now),
        )
        event = conn.execute("SELECT * FROM events WHERE id = ?", (cursor.lastrowid,)).fetchone()
        conn.commit()
    return EventResponse(**row_dict(event))


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "hermes-mission-control", "database": str(DB_PATH)}


@app.get("/api/tasks", response_model=list[TaskResponse])
def list_tasks(status_filter: Annotated[TaskStatus | None, Query(alias="status")] = None) -> list[dict]:
    with connect_db() as conn:
        if status_filter:
            rows = conn.execute(
                "SELECT * FROM tasks WHERE status = ? ORDER BY updated_at DESC, id DESC",
                (status_filter,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM tasks ORDER BY updated_at DESC, id DESC").fetchall()
    return [row_dict(row) for row in rows]


@app.post("/api/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate) -> dict:
    now = utc_now()
    project_id = payload.project_id

    # Auto-generate title from description if not provided
    title = payload.title
    if not title:
        # Extract first line or first 60 chars from description
        first_line = payload.description.strip().split('\n')[0]
        title = first_line[:60].strip()
        if not title:
            title = "Untitled Task"

    # Create a new workspace when requested. Use the supplied name if present;
    # otherwise derive a safe slug from the task description until AI planning
    # assigns a final project name.
    if payload.project_mode == "new":
        if payload.new_project_name:
            name_source = payload.new_project_name
        else:
            name_source = payload.description.strip().split("\n", 1)[0][:60]
        safe_name = "".join(
            c for c in name_source.lower().replace(" ", "-")
            if c.isalnum() or c in "-_"
        ).strip("-_")
        if not safe_name:
            safe_name = f"task-{int(time.time())}"
        target_dir = Path.home() / "workspaces" / safe_name
        target_dir.mkdir(parents=True, exist_ok=True)
        with connect_db() as conn:
            existing = conn.execute("SELECT id FROM projects WHERE name = ?", (safe_name,)).fetchone()
            if existing:
                project_id = existing["id"]
            else:
                cursor = conn.execute(
                    "INSERT INTO projects (name, type, local_path, description, created_at, updated_at) VALUES (?, 'local', ?, '', ?, ?)",
                    (safe_name, str(target_dir), now, now),
                )
                project_id = cursor.lastrowid
                conn.commit()

    with connect_db() as conn:
        cursor = conn.execute(
            "INSERT INTO tasks (title, description, status, profile, project_id, created_at, updated_at) VALUES (?, ?, 'planning', ?, ?, ?, ?)",
            (title, payload.description.strip(), payload.profile, project_id, now, now),
        )
        task = conn.execute("SELECT * FROM tasks WHERE id = ?", (cursor.lastrowid,)).fetchone()
        conn.commit()
    
    task_id = task["id"]
    publish_event(task_id, "task.created", f"Task created in planning stage (Project #{project_id or 'none'})") 
    
    # Trigger analysis in background (don't block task creation)
    import threading
    def run_analysis():
        try:
            analyze_task_tech_requirements(task_id)
        except Exception as e:
            print(f"[WARNING] Analysis failed for task {task_id}: {e}")
    
    analysis_thread = threading.Thread(target=run_analysis, daemon=True)
    analysis_thread.start()
    
    return row_dict(task)


# ==========================================
# Projects & GitHub Endpoints
# ==========================================

@app.get("/api/projects", response_model=list[ProjectResponse])
def list_projects() -> list[dict]:
    with connect_db() as conn:
        rows = conn.execute("SELECT * FROM projects ORDER BY updated_at DESC, id DESC").fetchall()
    return [row_dict(row) for row in rows]


@app.get("/api/tasks/{task_id}", response_model=TaskResponse)
def get_task(task_id: int) -> dict:
    with connect_db() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")
    return row_dict(row)


@app.patch("/api/tasks/{task_id}", response_model=TaskResponse)
def update_task_status(task_id: int, payload: TaskStatusUpdate) -> dict:
    now = utc_now()
    with connect_db() as conn:
        current_task = conn.execute("SELECT status FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not current_task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

        current_status = current_task["status"]
        new_status = payload.status

        # A queued task can return to planning only before execution begins.
        if current_status == "queued" and new_status == "planning":
            running_execution = conn.execute(
                "SELECT id FROM executions WHERE task_id = ? AND status = 'running' LIMIT 1",
                (task_id,),
            ).fetchone()
            if running_execution:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Cannot undo to planning while task is running",
                )
            conn.execute(
                "UPDATE prds SET status = 'draft', updated_at = ? WHERE task_id = ?",
                (now, task_id),
            )

        conn.execute(
            "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?",
            (new_status, now, task_id),
        )
        updated = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        conn.commit()

    message = f"Status changed to {new_status}"
    if current_status == "queued" and new_status == "planning":
        message = "Undone: queued → planning (PRD reset to draft for editing)"
    publish_event(task_id, "task.updated", message)
    return row_dict(updated)


@app.delete("/api/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_task(task_id: int) -> Response:
    with connect_db() as conn:
        task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        project_id = task["project_id"]
        project = None
        if project_id:
            project = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        
        # Publish event BEFORE deleting (FK constraint requires task to exist)
        publish_event(task_id, "task.deleted", f"Task deleted with workspace cleanup")
        
        # Delete task and all related records (cascade handled by DB foreign keys)
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()
    
    # Delete workspace folder if project exists and is local (not GitHub)
    if project and project["type"] == "local" and project["local_path"]:
        try:
            import shutil
            local_path = Path(project["local_path"])
            if local_path.exists():
                shutil.rmtree(local_path)
                print(f"[INFO] Deleted workspace: {local_path}")
        except Exception as e:
            print(f"[WARNING] Failed to delete workspace {project['local_path']}: {e}")
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate) -> dict:
    now = utc_now()
    local_path = payload.local_path
    if not local_path:
        local_path = str(Path.home() / "workspaces" / payload.name)
    Path(local_path).mkdir(parents=True, exist_ok=True)

    with connect_db() as conn:
        cursor = conn.execute(
            """INSERT INTO projects (name, type, local_path, github_repo, github_url, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (payload.name, payload.type, local_path, payload.github_repo, payload.github_url, payload.description, now, now),
        )
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (cursor.lastrowid,)).fetchone()
        conn.commit()
    return row_dict(row)


@app.get("/api/github/repos")
def list_github_repos(limit: int = Query(default=20, le=50)) -> list[dict]:
    """Fetch GitHub repositories accessible by the current environment."""
    try:
        proc = subprocess.run(
            ["gh", "repo", "list", "--limit", str(limit), "--json", "name,nameWithOwner,url,isPrivate,description,updatedAt"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if proc.returncode != 0:
            return []
        return json.loads(proc.stdout)
    except Exception as e:
        return []


@app.post("/api/github/import-project", response_model=ProjectResponse)
def import_github_project(repo_full_name: str = Query(...)) -> dict:
    """Import a GitHub repository as a registered project in workspace."""
    now = utc_now()
    repo_name = repo_full_name.split("/")[-1]
    target_dir = Path.home() / "workspaces" / repo_name
    
    # Clone if not already present
    if not target_dir.exists():
        target_dir.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["gh", "repo", "clone", repo_full_name, str(target_dir)],
            capture_output=True,
            text=True,
            timeout=60,
        )

    with connect_db() as conn:
        existing = conn.execute("SELECT * FROM projects WHERE name = ?", (repo_name,)).fetchone()
        if existing:
            return row_dict(existing)
        
        github_url = f"https://github.com/{repo_full_name}"
        cursor = conn.execute(
            """INSERT INTO projects (name, type, local_path, github_repo, github_url, description, created_at, updated_at)
            VALUES (?, 'github', ?, ?, ?, '', ?, ?)""",
            (repo_name, str(target_dir), repo_full_name, github_url, now, now),
        )
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (cursor.lastrowid,)).fetchone()
        conn.commit()
    return row_dict(row)


# ==========================================
# PRD & Planning Workflow Endpoints
# ==========================================

def is_existing_edit_task(task_title: str, task_description: str, project_id: int | None) -> bool:
    """Detect whether the task edits an existing script/app instead of creating a new project."""
    text = f"{task_title} {task_description}".lower()
    edit_keywords = {
        "edit", "update", "ubah", "modifikasi", "tambah", "hapus", "ganti",
        "perbaiki", "fix", "patch", "refactor", "optimize", "optimasi", "tuning",
        "tune", "debug", "installer", "script", "existing", "repo", "kode", "code",
        "function", "fungsi", "panggil", "sysctl", "conntrack", "vpn", "tunneling",
    }
    new_project_keywords = {
        "buatkan website", "buat website", "bikin website", "buat aplikasi baru",
        "new project", "project baru", "dari awal", "from scratch", "landing page baru",
    }
    if any(keyword in text for keyword in new_project_keywords):
        return False
    return bool(project_id) or any(keyword in text for keyword in edit_keywords)


def _extract_json_object(text: str) -> str | None:
    """Return the last standalone, valid JSON object found in mixed CLI output.

    ``hermes chat -q`` echoes the complete query before its answer. The query itself
    contains the JSON response template, so parsing from the first ``{`` can select
    that *invalid example* instead of the model's actual answer.
    """
    decoder = json.JSONDecoder()
    candidates: list[str] = []

    # Find all standalone, parseable JSON objects
    start_idx = 0
    while start_idx < len(text):
        start_idx = text.find("{", start_idx)
        if start_idx < 0:
            break
        try:
            value, end_idx = decoder.raw_decode(text[start_idx:])
        except json.JSONDecodeError:
            start_idx += 1
            continue
        if isinstance(value, dict):
            # Prefer candidate that has expected review keys if available
            has_review_keys = ("is_ready" in value and ("summary" in value or "questions" in value))
            candidates.append((has_review_keys, text[start_idx : start_idx + end_idx]))
            start_idx += end_idx
        else:
            start_idx += 1
            continue

    if not candidates:
        return None

    # Filter for candidates with review keys first
    valid_review_candidates = [c[1] for c in candidates if c[0]]
    if valid_review_candidates:
        return valid_review_candidates[-1]

    return candidates[-1][1]


def _extract_hermes_answer(text: str) -> str:
    """Prefer the content of the final Hermes answer panel when the CLI prints one."""
    panels = re.findall(
        r"╭─\s*☤ Hermes .*?╮\s*(.*?)\s*╰[─\s]*╯",
        text,
        flags=re.DOTALL,
    )
    return panels[-1] if panels else text


def _repair_json_via_hermes(hermes_bin: str, profile_name: str, malformed: str) -> dict | None:
    """Fallback: Ask Hermes to fix malformed JSON."""
    repair_prompt = f"""Perbaiki JSON berikut agar valid secara sintaksis dan kembalikan HANYA JSON tersebut tanpa komentar atau format markdown:\n\n{malformed}"""
    try:
        proc = subprocess.run(
            [hermes_bin, "--profile", profile_name, "chat", "-q", repair_prompt],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if proc.returncode == 0:
            cleaned = _extract_json_object(proc.stdout)
            if cleaned:
                return json.loads(cleaned)
    except Exception:
        pass
    return None


def call_hermes_profile_review(profile_name: str, task_title: str, task_description: str, is_edit: bool, project_info: dict | None = None) -> dict:
    """
    Call Hermes with specified profile to review task and determine if it needs clarification.
    
    Args:
        profile_name: Hermes profile name to invoke
        task_title: Task title
        task_description: Task description
        is_edit: Whether this is an edit/update task (vs brand-new project)
        project_info: Optional dict with keys: name, type (local/github), local_path, github_repo, github_url, description
    
    Returns: {
        "is_ready": bool,
        "summary": str (profile's assessment),
        "questions": [{id, question, placeholder, required}, ...] or [],
    }
    """
    # Locate hermes binary
    hermes_bin = shutil.which("hermes")
    if not hermes_bin:
        hermes_bin = str(Path.home() / ".local" / "bin" / "hermes")
        if not Path(hermes_bin).exists():
            return {
                "is_ready": False,
                "summary": f"Hermes CLI tidak ditemukan di sistem. Profil @{profile_name} tidak dapat dipanggil untuk review.",
                "questions": [],
            }
    
    task_type_label = "edit/update task untuk script/repo yang sudah ada" if is_edit else "brand-new project"
    
    # Build project context section
    project_context = ""
    if project_info:
        project_context = f"\n\n**Konteks Project:**"
        project_context += f"\n- Nama project: {project_info['name']}"
        project_context += f"\n- Tipe: {project_info['type']}"
        
        if project_info['type'] == 'github':
            if project_info.get('github_repo'):
                project_context += f"\n- Repository GitHub: {project_info['github_repo']}"
            if project_info.get('github_url'):
                project_context += f"\n- URL: {project_info['github_url']}"
        elif project_info['type'] == 'local':
            if project_info.get('local_path'):
                project_context += f"\n- Lokasi lokal: {project_info['local_path']}"
        
        if project_info.get('description'):
            project_context += f"\n- Deskripsi project: {project_info['description']}"
        
        project_context += "\n\n**PENTING:** Informasi project di atas sudah tersedia. JANGAN menanyakan lagi tentang lokasi repository, nama project, atau path workspace."
    
    prompt = f"""Kamu adalah @{profile_name}, seorang profil agen di system Hermes Mission Control.

Sebuah task baru telah diterima:
- Tipe: {task_type_label}
- Judul: {task_title}
- Deskripsi: {task_description}{project_context}

Tugasmu:
1. Review deskripsi task ini secara mendalam.
2. Tentukan apakah deskripsi sudah cukup lengkap untuk dimulai pengerjaan, atau masih ada yang kurang.
3. RESPOND HANYA DENGAN satu objek JSON valid, tanpa markdown atau teks lain.

Kontrak respons (ditulis sebagai field agar tidak ada contoh JSON yang dapat terbaca kembali dari output CLI):
- is_ready: boolean (`true` atau `false`)
- summary: string berisi penilaian singkat dari perspektif @{profile_name}
- questions: array objek; setiap objek wajib memiliki id (string), question (string), placeholder (string), dan required (boolean)

Jika is_ready bernilai true, questions wajib berupa array kosong.
Jika is_ready bernilai false, isi questions dengan 2-3 pertanyaan kontekstual yang spesifik untuk task ini.

Contoh summary is_ready=true:
"Deskripsi sudah sangat jelas dan detail. Tidak ada pertanyaan tambahan yang diperlukan untuk memulai pengerjaan."

Contoh summary is_ready=false:
"Deskripsi sudah bagus, tapi masih perlu klarifikasi tentang X dan Y sebelum mulai implementasi."

RESPOND HANYA DENGAN JSON. JANGAN ADA TEKS LAIN."""

    try:
        proc = subprocess.run(
            [
                hermes_bin,
                "--profile", profile_name,
                "chat",
                "-q", prompt,
            ],
            capture_output=True,
            text=True,
            timeout=300,
            env={**os.environ, "PATH": os.environ.get("PATH", "") + f":{Path.home() / '.local' / 'bin'}"},
        )
        
        if proc.returncode != 0:
            return {
                "is_ready": False,
                "summary": f"Profil @{profile_name} gagal diakses (exit code {proc.returncode}). Error: {proc.stderr[:200]}",
                "questions": [],
            }
        
        # Extract JSON from output (handle warnings, decorative lines, code fences)
        output = proc.stdout.strip()

        # Prefer the final Hermes answer panel content when present
        output = _extract_hermes_answer(output)

        # Remove remaining code fences
        output = re.sub(r'```json\s*', '', output)  # Code fence start
        output = re.sub(r'```\s*', '', output)      # Code fence end
        output = re.sub(r'Resume this session.*', '', output, flags=re.DOTALL)  # Session footer

        json_text = _extract_json_object(output)

        if not json_text:
            logger.warning(
                "No JSON found in @%s review output (first 500 chars): %r",
                profile_name, output[:500],
            )
            return {
                "is_ready": False,
                "summary": f"Profil @{profile_name} tidak mengembalikan JSON yang valid untuk review task.",
                "questions": [],
            }

        try:
            review = json.loads(json_text)
        except json.JSONDecodeError as e:
            logger.error(
                "JSON decode failed for @%s (offset %s): %r -- extracted: %r",
                profile_name, e.pos, e.msg, json_text[:500],
            )
            # Last resort: ask Hermes to repair the JSON once
            repaired = _repair_json_via_hermes(hermes_bin, profile_name, json_text)
            if repaired is not None:
                review = repaired
            else:
                return {
                    "is_ready": False,
                    "summary": f"Profil @{profile_name} memberikan respons yang tidak valid (JSON parse error).",
                    "questions": [],
                }

        if not isinstance(review, dict):
            return {
                "is_ready": False,
                "summary": f"Profil @{profile_name} mengembalikan JSON dengan tipe tidak sesuai.",
                "questions": [],
            }

        # Validate response structure
        if not isinstance(review.get("is_ready"), bool):
            review["is_ready"] = False
        if not isinstance(review.get("summary"), str):
            review["summary"] = "Profil memberikan review tanpa summary."
        if not isinstance(review.get("questions"), list):
            review["questions"] = []

        return review
    
    except subprocess.TimeoutExpired:
        return {
            "is_ready": False,
            "summary": f"Review dari @{profile_name} timed out setelah 5 menit (300 detik).",
            "questions": [],
        }
    except json.JSONDecodeError as e:
        return {
            "is_ready": False,
            "summary": f"Profil @{profile_name} memberikan respons yang tidak valid (JSON parse error).",
            "questions": [],
        }
    except Exception as e:
        return {
            "is_ready": False,
            "summary": f"Error menghubungi profil @{profile_name}: {str(e)}",
            "questions": [],
        }


def build_contextual_planning_questions(task_title: str, task_description: str, profile_name: str | None) -> list[dict]:
    """Generate contextual questions for edit/update tasks. No frontend/backend/database boilerplate."""
    text = f"{task_title} {task_description}".lower()
    questions = [
        {
            "id": "target_scope",
            "question": "File atau bagian mana yang harus diedit?",
            "placeholder": "Contoh: install.sh, function install_dynamic(), atau path repo/script yang relevan.",
            "required": True,
        },
        {
            "id": "expected_behavior",
            "question": "Perilaku akhir yang kamu mau seperti apa?",
            "placeholder": "Jelaskan hasil yang harus terjadi setelah perubahan dijalankan.",
            "required": True,
        },
        {
            "id": "constraints",
            "question": "Apa batasan yang tidak boleh dilanggar?",
            "placeholder": "Contoh: jangan ubah flow login, harus idempotent, jangan install dependency baru, tetap kompatibel Ubuntu 22.04.",
            "required": False,
        },
    ]

    if any(keyword in text for keyword in ["conntrack", "sysctl", "nf_conntrack", "time_wait", "vpn", "tunneling", "installer"]):
        questions = [
            {
                "id": "target_script",
                "question": "Script installer mana yang harus diedit?",
                "placeholder": "Contoh: rainbow.sh, install-dynamic.sh, atau path lengkap file installer di workspace.",
                "required": True,
            },
            {
                "id": "conntrack_values",
                "question": "Nilai tuning conntrack yang harus dipakai apa saja?",
                "placeholder": "Contoh: nf_conntrack_max=2000000, tcp time_wait timeout=30, persist ke /etc/sysctl.d/99-conntrack.conf.",
                "required": True,
            },
            {
                "id": "install_flow_position",
                "question": "Fungsi baru harus dipanggil di tahap mana dalam alur install?",
                "placeholder": "Contoh: setelah install package kernel module, sebelum service restart, atau sebelum konfigurasi VPN dibuat.",
                "required": False,
            },
            {
                "id": "verification_logging",
                "question": "Bagaimana verifikasi dan log hasilnya harus ditampilkan?",
                "placeholder": "Contoh: cat /proc/sys/net/netfilter/nf_conntrack_max, warning jika gagal, lanjut install tanpa fatal exit.",
                "required": False,
            },
        ]

    return questions


@app.post("/api/tasks/{task_id}/plan/analyze")
def analyze_task_tech_requirements(task_id: int) -> dict:
    """
    Analyze task and decide the planning mode:
    - 'contextual' for edit/update tasks on existing scripts or projects (no tech-stack boilerplate)
    - 'tech_stack' for brand-new projects (guided tech stack wizard)
    
    Cached: analysis runs once per task and is saved to DB.
    """
    with connect_db() as conn:
        # Check cache first
        cached = conn.execute("SELECT analysis_json FROM task_plan_analyses WHERE task_id = ?", (task_id,)).fetchone()
        if cached:
            return json.loads(cached["analysis_json"])
        
        task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        project = None
        if task["project_id"]:
            project = conn.execute("SELECT * FROM projects WHERE id = ?", (task["project_id"],)).fetchone()

    # Lead profile: explicit choice on the task wins, otherwise fall back to keyword matching
    lead_profile = task["profile"]
    if lead_profile:
        # User sudah memilih profil eksplisit, gunakan hanya profil itu
        matched_profiles = {lead_profile: "Profil yang dipilih saat task dibuat."}
    else:
        # Tidak ada pilihan eksplisit, lakukan auto-matching berdasarkan keyword
        matched_profiles = analyze_task_for_profiles(task["title"], task["description"])
    
    profile_list = [{"name": name, "reason": reason} for name, reason in matched_profiles.items()]

    is_edit = is_existing_edit_task(task["title"], task["description"], task["project_id"])

    if is_edit:
        # Call Hermes profile to genuinely review the task
        profile_name = lead_profile or "default"
        
        # Build project_info dict for context
        project_info = None
        if project:
            project_info = {
                "name": project["name"],
                "type": project["type"],
                "local_path": project["local_path"],
                "github_repo": project["github_repo"],
                "github_url": project["github_url"],
                "description": project["description"],
            }
        
        review = call_hermes_profile_review(
            profile_name, 
            task["title"], 
            task["description"], 
            is_edit=True, 
            project_info=project_info
        )
        
        project_context = (
            f" di workspace `{project['name']}`" if project else ""
        )
        
        is_ready = review.get("is_ready", False)
        summary = review.get("summary", "")
        questions = review.get("questions", [])
        
        if is_ready:
            final_summary = (
                f"@{profile_name} mereview task ini{project_context}: {summary}"
            )
        else:
            final_summary = (
                f"@{profile_name} mereview task ini{project_context}. {summary}"
            )

        result = {
            "task_id": task["id"],
            "task_title": task["title"],
            "task_description": task["description"],
            "planning_type": "contextual",
            "is_complete": is_ready,
            "lead_profile": profile_name,
            "summary": final_summary,
            "estimated_complexity": "simple",
            "estimated_duration": "1-3 jam",
            "recommended_profiles": profile_list,
            "categories": [],
            "questions": questions,
        }
        # Cache result to DB so future opens don't re-run Hermes
        with connect_db() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO task_plan_analyses (task_id, analysis_json, created_at) VALUES (?, ?, ?)",
                (task["id"], json.dumps(result), utc_now()),
            )
            conn.commit()
        return result

    # Brand-new project: guided tech stack wizard
    categories = build_tech_stack_catalog(task["title"], task["description"])

    category_count = len(categories)
    if category_count <= 3:
        complexity = "simple"
        duration = "8-16 jam"
    elif category_count <= 5:
        complexity = "moderate"
        duration = "20-40 jam"
    else:
        complexity = "complex"
        duration = "40-80 jam"

    result = {
        "task_id": task["id"],
        "task_title": task["title"],
        "task_description": task["description"],
        "planning_type": "tech_stack",
        "lead_profile": lead_profile,
        "summary": f"@{lead_profile or 'default'} menganalisis '{task['title']}' sebagai proyek baru dan menyiapkan pilihan teknologi yang paling sesuai.",
        "estimated_complexity": complexity,
        "estimated_duration": duration,
        "recommended_profiles": profile_list,
        "categories": categories,
        "questions": [],
    }
    # Cache result to DB
    with connect_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO task_plan_analyses (task_id, analysis_json, created_at) VALUES (?, ?, ?)",
            (task["id"], json.dumps(result), utc_now()),
        )
        conn.commit()
    return result


@app.post("/api/tasks/{task_id}/plan/submit-tech-choices", response_model=PRDResponse)
def submit_tech_stack_choices(task_id: int, payload: SubmitTechChoicesPayload) -> dict:
    """
    User submits their tech stack choices. Generate comprehensive PRD, assign profiles.
    Task stays in 'planning' until user clicks 'Approve Plan & Queue Task'.
    """
    with connect_db() as conn:
        task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        project = None
        if task["project_id"]:
            project = conn.execute("SELECT * FROM projects WHERE id = ?", (task["project_id"],)).fetchone()

    # Build catalog to resolve choice IDs to full names/descriptions
    categories = build_tech_stack_catalog(task["title"], task["description"])
    tech_selections = []
    for cat in categories:
        cat_id = cat["id"]
        selected_option_id = payload.choices.get(cat_id, cat.get("selected"))
        matched_option = next((opt for opt in cat["options"] if opt["id"] == selected_option_id), None)
        if matched_option:
            tech_selections.append({
                "category": cat["title"],
                "choice": matched_option["name"],
                "description": matched_option["description"]
            })

    # Build PRD content
    tech_summary = "\n".join([f"- **{sel['category']}**: {sel['choice']}\n  _{sel['description']}_" for sel in tech_selections])
    project_context = f"- Target Project: `{project['name']}` ({project['type']})\n- Workspace Path: `{project['local_path']}`" if project else "- Target Project: Standalone Task (No linked workspace)"
    user_notes = f"\n\n### Catatan Tambahan User\n{payload.notes}" if payload.notes.strip() else ""

    prd_content = f"""# Product Requirement Document (PRD)

## 1. Project Overview & Objective
**Task**: {task['title']}  
**Lead Planner**: @{task['profile'] or 'default'}  
**Status**: Planning Review  

{task['description']}

### Workspace & Project Scope
{project_context}

---

## 2. Tech Stack yang Dipilih (Berdasarkan Analisis Profil)
{tech_summary}{user_notes}

---

## 3. Architecture & Functional Specification
- **Core Endpoints / Components**: Implementasi bertahap dengan contract-first API design.
- **Data Model**: Persistensi relasional dengan migrasi aman dan indexing terukur.
- **Workflow / Handshake**: Lead profile memvalidasi output sebelum masuk tahap deployment.

---

## 4. Execution & Quality Gates
1. Unit & endpoint verification.
2. Mobile UI compatibility (refero-design & zero AI-slop).
3. Secret scanning & safe variable handling.
4. Integration test coverage untuk setiap tech stack yang dipilih.
"""

    now = utc_now()
    # Store choices as QA history for reference
    qa_history_json = json.dumps([{"question": sel["category"], "answer": sel["choice"]} for sel in tech_selections])

    with connect_db() as conn:
        # Upsert PRD
        existing_prd = conn.execute("SELECT id FROM prds WHERE task_id = ?", (task_id,)).fetchone()
        if existing_prd:
            conn.execute(
                "UPDATE prds SET title = ?, content = ?, qa_history = ?, updated_at = ? WHERE task_id = ?",
                (f"PRD: {task['title']}", prd_content, qa_history_json, now, task_id),
            )
            prd_row = conn.execute("SELECT * FROM prds WHERE task_id = ?", (task_id,)).fetchone()
        else:
            cursor = conn.execute(
                "INSERT INTO prds (task_id, title, content, qa_history, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?)",
                (task_id, f"PRD: {task['title']}", prd_content, qa_history_json, now, now),
            )
            prd_row = conn.execute("SELECT * FROM prds WHERE id = ?", (cursor.lastrowid,)).fetchone()

        # Auto-analyze and assign profiles
        recommended_profiles = analyze_task_for_profiles(task["title"], f"{task['description']}\n{tech_summary}")
        for prof_name, reason in recommended_profiles.items():
            conn.execute(
                """INSERT INTO task_assignments (task_id, profile_name, role, reason, created_at)
                VALUES (?, ?, 'contributor', ?, ?)
                ON CONFLICT(task_id, profile_name) DO UPDATE SET reason = excluded.reason""",
                (task_id, prof_name, reason, now),
            )

        # PRD generated, task stays in 'planning' for user review
        # User must click 'Approve Plan & Queue Task' to move to 'queued'
        # conn.execute("UPDATE tasks SET status = 'queued', updated_at = ? WHERE id = ?", (now, task_id))
        conn.commit()

    publish_event(task_id, "prd.generated", f"PRD generated from tech choices with {len(recommended_profiles)} assigned profiles")
    publish_event(task_id, "task.updated", "PRD ready for review in planning") 

    data = row_dict(prd_row)
    data["qa_history"] = json.loads(data["qa_history"])
    return data


@app.get("/api/tasks/{task_id}/plan/questions")
def get_planning_questions(task_id: int) -> dict:
    """DEPRECATED: Return standard static discovery questionnaire for technical planning."""
    return {
        "questions": [
            {
                "id": "tech_stack",
                "question": "Tech stack apa yang wajib atau diutamakan? (misal: FastAPI, React, Node.js, dsb.)",
                "placeholder": "Contoh: FastAPI backend, Vite React frontend, SQLite/PostgreSQL"
            },
            {
                "id": "scope_boundaries",
                "question": "Apa saja batasan fitur (core MVP vs scope yang ditunda)?",
                "placeholder": "Contoh: MVP fokus webhook & dashboard admin; auto-refund ditunda"
            },
            {
                "id": "integration_targets",
                "question": "Apakah ada third-party API / sistem eksternal yang diintegrasikan?",
                "placeholder": "Contoh: Midtrans Snap / Stripe API, Webhook signature verification"
            },
            {
                "id": "non_functional",
                "question": "Ekspektasi keamanan, SLA, atau performa utama?",
                "placeholder": "Contoh: Logging transaksi aman, tidak ada kebocoran secret, mobile-friendly"
            }
        ]
    }


@app.post("/api/tasks/{task_id}/plan/generate-prd", response_model=PRDResponse)
def generate_prd(task_id: int, payload: PRDCreate) -> dict:
    """Generate Markdown PRD and automatically assign relevant profiles."""
    with connect_db() as conn:
        task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        project = None
        if task["project_id"]:
            project = conn.execute("SELECT * FROM projects WHERE id = ?", (task["project_id"],)).fetchone()

    qa_summary = "\n".join([f"- **{qa.question}**: {qa.answer}" for qa in payload.qa_history if qa.answer.strip()])
    project_context = f"- Target Project: `{project['name']}` ({project['type']})\n- Workspace Path: `{project['local_path']}`" if project else "- Target Project: Standalone Task (No linked workspace)"

    prd_content = f"""# Product Requirement Document (PRD)

## 1. Project Overview & Objective
**Task**: {task['title']}  
**Lead Planner**: @{task['profile'] or 'default'}  
**Status**: Planning Review  

{task['description']}

### Workspace & Project Scope
{project_context}

---

## 2. Technical Clarifications & Requirements
{qa_summary or '*(Tidak ada spesifikasi tambahan yang diberikan)*'}

---

## 3. Architecture & Functional Specification
- **Core Endpoints / Components**: Implementasi bertahap dengan contract-first API.
- **Data Model**: Persistensi relasional dengan migrasi aman dan indexing terukur.
- **Workflow / Handshake**: Lead profile memvalidasi output sebelum masuk tahap deployment.

---

## 4. Execution & Quality Gates
1. Unit & endpoint verification.
2. Mobile UI compatibility (refero-design & zero AI-slop).
3. Secret scanning & safe variable handling.
"""

    now = utc_now()
    qa_history_json = json.dumps([qa.model_dump() for qa in payload.qa_history])

    with connect_db() as conn:
        # Upsert PRD
        existing_prd = conn.execute("SELECT id FROM prds WHERE task_id = ?", (task_id,)).fetchone()
        if existing_prd:
            conn.execute(
                "UPDATE prds SET title = ?, content = ?, qa_history = ?, updated_at = ? WHERE task_id = ?",
                (f"PRD: {task['title']}", prd_content, qa_history_json, now, task_id),
            )
            prd_row = conn.execute("SELECT * FROM prds WHERE task_id = ?", (task_id,)).fetchone()
        else:
            cursor = conn.execute(
                "INSERT INTO prds (task_id, title, content, qa_history, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?)",
                (task_id, f"PRD: {task['title']}", prd_content, qa_history_json, now, now),
            )
            prd_row = conn.execute("SELECT * FROM prds WHERE id = ?", (cursor.lastrowid,)).fetchone()

        # Auto-analyze profiles and create assignments
        recommended_profiles = analyze_task_for_profiles(task["title"], f"{task['description']}\n{qa_summary}")
        for prof_name, reason in recommended_profiles.items():
            conn.execute(
                """INSERT INTO task_assignments (task_id, profile_name, role, reason, created_at)
                VALUES (?, ?, 'contributor', ?, ?)
                ON CONFLICT(task_id, profile_name) DO UPDATE SET reason = excluded.reason""",
                (task_id, prof_name, reason, now),
            )

        # PRD generated, task stays in 'planning' for user review
        # User must click 'Approve Plan & Queue Task' to move to 'queued'
        # conn.execute("UPDATE tasks SET status = 'queued', updated_at = ? WHERE id = ?", (now, task_id))
        conn.commit()

    publish_event(task_id, "prd.generated", f"PRD generated with {len(recommended_profiles)} assigned profiles")
    publish_event(task_id, "task.updated", "PRD ready for review in planning")

    data = row_dict(prd_row)
    data["qa_history"] = json.loads(data["qa_history"])
    return data


@app.get("/api/tasks/{task_id}/prd", response_model=PRDResponse)
def get_task_prd(task_id: int) -> dict:
    with connect_db() as conn:
        row = conn.execute("SELECT * FROM prds WHERE task_id = ?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="PRD not found for this task")
    data = row_dict(row)
    data["qa_history"] = json.loads(data["qa_history"])
    return data


@app.patch("/api/tasks/{task_id}/prd", response_model=PRDResponse)
def update_task_prd(task_id: int, payload: dict) -> dict:
    content = payload.get("content")
    if not content:
        raise HTTPException(status_code=400, detail="content field required")
    now = utc_now()
    with connect_db() as conn:
        task = conn.execute("SELECT status FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["status"] != "planning":
            raise HTTPException(status_code=400, detail=f"PRD can only be edited while task is in 'planning' status (current status: {task['status']})")
        conn.execute("UPDATE prds SET content = ?, updated_at = ? WHERE task_id = ?", (content, now, task_id))
        row = conn.execute("SELECT * FROM prds WHERE task_id = ?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="PRD not found")
        conn.commit()
    publish_event(task_id, "prd.updated", "PRD content updated by user")
    data = row_dict(row)
    data["qa_history"] = json.loads(data["qa_history"])
    return data


@app.get("/api/tasks/{task_id}/assignments", response_model=list[TaskAssignmentResponse])
def list_task_assignments(task_id: int) -> list[dict]:
    with connect_db() as conn:
        rows = conn.execute("SELECT * FROM task_assignments WHERE task_id = ? ORDER BY id ASC", (task_id,)).fetchall()
    return [row_dict(row) for row in rows]


@app.post("/api/tasks/{task_id}/assignments", response_model=TaskAssignmentResponse)
def create_task_assignment(task_id: int, payload: TaskAssignmentCreate) -> dict:
    now = utc_now()
    with connect_db() as conn:
        cursor = conn.execute(
            """INSERT INTO task_assignments (task_id, profile_name, role, reason, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(task_id, profile_name) DO UPDATE SET role = excluded.role, reason = excluded.reason""",
            (task_id, payload.profile_name, payload.role, payload.reason, now),
        )
        row = conn.execute("SELECT * FROM task_assignments WHERE id = ?", (cursor.lastrowid,)).fetchone()
        conn.commit()
    publish_event(task_id, "assignment.updated", f"Assigned profile @{payload.profile_name} as {payload.role}")
    return row_dict(row)


@app.delete("/api/tasks/{task_id}/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_task_assignment(task_id: int, assignment_id: int) -> Response:
    with connect_db() as conn:
        cursor = conn.execute("DELETE FROM task_assignments WHERE id = ? AND task_id = ?", (assignment_id, task_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Assignment not found")
        conn.commit()
    publish_event(task_id, "assignment.deleted", f"Assignment #{assignment_id} removed")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/tasks/{task_id}/plan/approve")
def approve_plan_to_queued(task_id: int) -> dict:
    now = utc_now()
    with connect_db() as conn:
        conn.execute("UPDATE tasks SET status = 'queued', updated_at = ? WHERE id = ?", (now, task_id))
        conn.execute("UPDATE prds SET status = 'approved', updated_at = ? WHERE task_id = ?", (now, task_id))
        task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        conn.commit()
    publish_event(task_id, "task.updated", "Task PRD approved and queued for execution")
    return row_dict(task)



@app.get("/api/events")
async def stream_events(
    request: Request,
    last_event_id_query: Annotated[int | None, Query(alias="lastEventId")] = None,
    last_event_id_header: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
) -> StreamingResponse:
    async def generate() -> AsyncIterator[str]:
        try:
            cursor = int(last_event_id_header or last_event_id_query or 0)
        except ValueError:
            cursor = 0

        while not await request.is_disconnected():
            with connect_db() as conn:
                rows = conn.execute("SELECT * FROM events WHERE id > ? ORDER BY id LIMIT 100", (cursor,)).fetchall()
            for row in rows:
                cursor = row["id"]
                yield f"id: {row['id']}\nevent: {row['kind']}\ndata: {json.dumps(row_dict(row))}\n\n"
            yield ": keep-alive\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.get("/api/profiles", response_model=list[ProfileResponse])
def list_profiles() -> list[dict]:
    profiles: list[dict] = []

    if HERMES_HOME.exists():
        profiles.append(
            {
                "name": "default",
                "path": str(HERMES_HOME),
                "has_soul": (HERMES_HOME / "SOUL.md").exists(),
                "is_default": True,
            }
        )

    profiles_dir = HERMES_HOME / "profiles"
    if profiles_dir.exists():
        for path in sorted(profiles_dir.iterdir()):
            # Skip hidden entries such as the CLI's ".deleted" trash directory.
            if path.is_dir() and not path.name.startswith("."):
                profiles.append(
                    {
                        "name": path.name,
                        "path": str(path),
                        "has_soul": (path / "SOUL.md").exists(),
                        "is_default": False,
                    }
                )
    return profiles


# ==========================================
# Profile administration (create / delete / SOUL.md / skills)
# ==========================================

PROFILE_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
SKILL_DIR_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]{0,79}$")


def profiles_root() -> Path:
    return HERMES_HOME / "profiles"


def resolve_profile_dir(profile_name: str, must_exist: bool = True) -> Path:
    """Resolve a profile name to its directory, refusing anything outside the profiles root."""
    if profile_name == "default":
        target = HERMES_HOME
    else:
        if not PROFILE_NAME_RE.match(profile_name or ""):
            raise HTTPException(
                status_code=400,
                detail="Nama profil tidak valid. Gunakan huruf kecil, angka, tanda hubung atau garis bawah.",
            )
        root = profiles_root().resolve()
        target = (root / profile_name).resolve()
        if target != root and root not in target.parents:
            raise HTTPException(status_code=400, detail="Path profil tidak valid")
    if must_exist and not target.is_dir():
        raise HTTPException(status_code=404, detail=f"Profil '{profile_name}' tidak ditemukan")
    return target


def profile_skills_dir(profile_dir: Path) -> Path:
    return profile_dir / "skills"


def gateway_state() -> dict:
    """Best-effort read of the live gateway state file."""
    state_file = HERMES_HOME / "gateway_state.json"
    if not state_file.is_file():
        return {}
    try:
        return json.loads(state_file.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Could not read gateway_state.json: %s", exc)
        return {}


def gateway_live_bindings() -> dict[str, list[str]]:
    """Profiles with a live platform binding, e.g. {'natasha': ['telegram']}.

    The gateway hot-adopts every profile it sees, so plain membership in
    served_profiles is not a reason to refuse deletion. A connected platform
    binding for that specific profile is.
    """
    state = gateway_state()
    if str(state.get("gateway_state") or "") != "running":
        return {}
    bindings: dict[str, list[str]] = {}
    for key, value in (state.get("platforms") or {}).items():
        if ":" not in key:
            continue
        profile_name, platform = key.split(":", 1)
        if (value or {}).get("state") == "connected":
            bindings.setdefault(profile_name, []).append(platform)
    return bindings


def run_hermes(args: list[str], timeout: int = 180) -> subprocess.CompletedProcess:
    """Run the hermes CLI and surface failures as HTTP errors."""
    try:
        return subprocess.run([HERMES_BIN, *args], capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Perintah hermes timeout")
    except Exception as exc:
        logger.error("hermes %s failed: %s", " ".join(args), exc)
        raise HTTPException(status_code=500, detail=str(exc))


def parse_skill_frontmatter(skill_md: Path) -> dict:
    """Pull name/description out of a SKILL.md YAML frontmatter block (best effort)."""
    info: dict[str, str] = {}
    try:
        text = skill_md.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return info
    if not text.startswith("---"):
        return info
    lines = text.split("\n")[1:120]
    index = 0
    while index < len(lines):
        raw = lines[index]
        if raw.strip() == "---":
            break
        match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$", raw.strip())
        if not match:
            index += 1
            continue
        key, value = match.group(1).lower(), match.group(2).strip()
        # YAML block scalar: description: | / > followed by indented lines
        if value in ("|", ">", "|-", ">-", "|+", ">+"):
            block: list[str] = []
            index += 1
            while index < len(lines) and (not lines[index].strip() or lines[index].startswith((" ", "\t"))):
                block.append(lines[index].strip())
                index += 1
            value = " ".join(part for part in block if part).strip()
            info[key] = value
            continue
        info[key] = value.strip().strip("'\"")
        index += 1
    return info


def scan_skills(root: Path) -> list[dict]:
    """Every skill directory (a dir holding SKILL.md) under root, skipping hidden dirs."""
    found: list[dict] = []
    if not root.is_dir():
        return found
    for skill_md in root.rglob("SKILL.md"):
        skill_dir = skill_md.parent
        rel = skill_dir.relative_to(root)
        parts = rel.parts
        if any(part.startswith(".") for part in parts):
            continue
        meta = parse_skill_frontmatter(skill_md)
        found.append({
            "name": meta.get("name") or skill_dir.name,
            "dir_name": skill_dir.name,
            "category": parts[0] if len(parts) > 1 else "",
            "description": (meta.get("description") or "")[:200],
            "path": str(skill_dir),
        })
    found.sort(key=lambda item: (item["category"], item["name"]))
    return found


class ProfileCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=400)
    clone_from: str | None = Field(default=None, max_length=64)
    include_skills: bool = False


class SoulUpdateRequest(BaseModel):
    content: str = Field(default="", max_length=400_000)


class SkillAddRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    category: str | None = Field(default=None, max_length=80)


@app.post("/api/profiles", status_code=status.HTTP_201_CREATED)
def create_profile(payload: ProfileCreateRequest) -> dict:
    """Create a new profile through the hermes CLI, without touching existing routes."""
    name = payload.name.strip().lower()
    if not PROFILE_NAME_RE.match(name):
        raise HTTPException(
            status_code=400,
            detail="Nama profil tidak valid. Gunakan huruf kecil/angka, maksimal 64 karakter.",
        )
    if name == "default":
        raise HTTPException(status_code=400, detail="Profil 'default' tidak bisa dibuat ulang")

    if resolve_profile_dir(name, must_exist=False).exists():
        raise HTTPException(status_code=409, detail=f"Profil '{name}' sudah ada")

    args = ["profile", "create", name]
    if payload.description and payload.description.strip():
        args += ["--description", payload.description.strip()]
    if payload.clone_from and payload.clone_from.strip():
        source = payload.clone_from.strip()
        if source != "default" and not PROFILE_NAME_RE.match(source):
            raise HTTPException(status_code=400, detail="Profil sumber tidak valid")
        if not resolve_profile_dir(source, must_exist=False).is_dir():
            raise HTTPException(status_code=404, detail=f"Profil sumber '{source}' tidak ditemukan")
        args += ["--clone-from", source]
    if not payload.include_skills:
        args.append("--no-skills")

    proc = run_hermes(args)
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "Gagal membuat profil").strip()
        raise HTTPException(status_code=500, detail=detail[-600:])

    created = resolve_profile_dir(name, must_exist=False)
    return {
        "name": name,
        "path": str(created),
        "has_soul": (created / "SOUL.md").exists(),
        "is_default": False,
        "output": (proc.stdout or "").strip()[-400:],
    }


@app.delete("/api/profiles/{profile_name}")
def delete_profile(profile_name: str, confirm: str = Query(default="")) -> dict:
    """Delete a profile. Requires confirm=<profile_name> typed by the user."""
    if profile_name == "default":
        raise HTTPException(status_code=400, detail="Profil 'default' tidak bisa dihapus")
    if confirm != profile_name:
        raise HTTPException(status_code=400, detail="Konfirmasi tidak cocok dengan nama profil")

    target = resolve_profile_dir(profile_name)

    bindings = gateway_live_bindings().get(profile_name)
    if bindings:
        platforms = ", ".join(sorted(bindings))
        raise HTTPException(
            status_code=409,
            detail=(
                f"Profil '{profile_name}' masih terhubung ke platform {platforms} di gateway aktif. "
                "Lepas binding platform profil tersebut dulu sebelum menghapus."
            ),
        )

    proc = run_hermes(["profile", "delete", "-y", profile_name], timeout=120)
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "Gagal menghapus profil").strip()
        raise HTTPException(status_code=500, detail=detail[-600:])

    # The CLI leaves a small bookkeeping entry at profiles/.deleted/<name>.
    # The profile data itself is already gone; clear the leftover too so the
    # name can be reused cleanly. The move can land just after the CLI exits.
    purged = False
    trash_root = profiles_root() / ".deleted"
    trash = trash_root / profile_name
    for _ in range(20):
        if trash.exists() or trash.is_symlink():
            try:
                if trash.is_dir() and not trash.is_symlink():
                    shutil.rmtree(trash)
                else:
                    trash.unlink()
                purged = True
            except Exception as exc:
                logger.warning("Could not clear delete marker %s: %s", trash, exc)
            break
        time.sleep(0.25)
    try:
        if trash_root.is_dir() and not any(trash_root.iterdir()):
            trash_root.rmdir()
    except Exception:
        pass

    return {"deleted": profile_name, "path": str(target), "purged": purged}


@app.get("/api/profiles/{profile_name}/soul")
def get_profile_soul(profile_name: str) -> dict:
    """Read the SOUL.md of a profile."""
    target = resolve_profile_dir(profile_name)
    soul_file = target / "SOUL.md"
    exists = soul_file.is_file()
    return {
        "profile": profile_name,
        "path": str(soul_file),
        "exists": exists,
        "content": soul_file.read_text(encoding="utf-8") if exists else "",
        "updated_at": datetime.fromtimestamp(soul_file.stat().st_mtime, timezone.utc).isoformat() if exists else None,
    }


@app.put("/api/profiles/{profile_name}/soul")
def update_profile_soul(profile_name: str, payload: SoulUpdateRequest) -> dict:
    """Write SOUL.md, keeping a timestamped backup of the previous content."""
    target = resolve_profile_dir(profile_name)
    soul_file = target / "SOUL.md"

    backup_path: str | None = None
    if soul_file.is_file():
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = target / f"SOUL.md.bak-{stamp}"
        shutil.copy2(soul_file, backup)
        backup_path = str(backup)

    soul_file.write_text(payload.content, encoding="utf-8")
    return {
        "profile": profile_name,
        "path": str(soul_file),
        "bytes": len(payload.content.encode("utf-8")),
        "backup": backup_path,
    }


@app.get("/api/skills/catalog")
def skills_catalog(profile: str | None = None) -> dict:
    """Every skill available on this host (source pool = the default profile's skills dir)."""
    pool = scan_skills(HERMES_HOME / "skills")
    installed: set[str] = set()
    if profile:
        installed = {item["dir_name"] for item in scan_skills(profile_skills_dir(resolve_profile_dir(profile)))}
    for item in pool:
        item["installed"] = item["dir_name"] in installed
    categories = sorted({item["category"] for item in pool if item["category"]})
    return {"skills": pool, "count": len(pool), "categories": categories}


@app.get("/api/profiles/{profile_name}/skills")
def list_profile_skills(profile_name: str) -> dict:
    """Skills installed in one profile."""
    target = resolve_profile_dir(profile_name)
    items = scan_skills(profile_skills_dir(target))
    return {
        "profile": profile_name,
        "skills": items,
        "count": len(items),
        "is_global_pool": profile_name == "default",
    }


@app.post("/api/profiles/{profile_name}/skills", status_code=status.HTTP_201_CREATED)
def add_profile_skill(profile_name: str, payload: SkillAddRequest) -> dict:
    """Copy a skill from the host pool into a profile's skills dir."""
    if profile_name == "default":
        raise HTTPException(
            status_code=400,
            detail="Profil 'default' memakai katalog global, jadi seluruh skill sudah tersedia di sana.",
        )
    if not SKILL_DIR_NAME_RE.match(payload.name):
        raise HTTPException(status_code=400, detail="Nama skill tidak valid")

    pool = scan_skills(HERMES_HOME / "skills")
    wanted_category = (payload.category or "").strip()
    candidates = [item for item in pool if item["dir_name"] == payload.name]
    if wanted_category:
        narrowed = [item for item in candidates if item["category"] == wanted_category]
        candidates = narrowed or candidates
    if not candidates:
        raise HTTPException(status_code=404, detail=f"Skill '{payload.name}' tidak ada di katalog host")

    source = Path(candidates[0]["path"])
    category = candidates[0]["category"]

    skills_root = profile_skills_dir(resolve_profile_dir(profile_name)).resolve()
    destination = (skills_root / category / payload.name).resolve()
    if skills_root not in destination.parents:
        raise HTTPException(status_code=400, detail="Tujuan skill tidak valid")
    if destination.exists():
        raise HTTPException(status_code=409, detail=f"Skill '{payload.name}' sudah terpasang di profil ini")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, destination)

    return {
        "profile": profile_name,
        "name": payload.name,
        "category": category,
        "path": str(destination),
    }


@app.delete("/api/profiles/{profile_name}/skills/{skill_name}")
def delete_profile_skill(profile_name: str, skill_name: str, category: str = Query(default="")) -> dict:
    """Remove a skill directory from a profile."""
    if profile_name == "default":
        raise HTTPException(
            status_code=400,
            detail="Skill katalog global tidak dihapus dari sini, karena dipakai bersama semua profil.",
        )
    if not SKILL_DIR_NAME_RE.match(skill_name):
        raise HTTPException(status_code=400, detail="Nama skill tidak valid")

    skills_root = profile_skills_dir(resolve_profile_dir(profile_name)).resolve()
    matches = [
        item for item in scan_skills(skills_root)
        if item["dir_name"] == skill_name and (not category or item["category"] == category)
    ]
    if not matches:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' tidak terpasang di profil ini")

    target = Path(matches[0]["path"]).resolve()
    if skills_root not in target.parents:
        raise HTTPException(status_code=400, detail="Target skill tidak valid")

    shutil.rmtree(target)

    parent = target.parent
    if parent != skills_root and parent.is_dir() and not any(parent.iterdir()):
        parent.rmdir()

    return {"profile": profile_name, "removed": skill_name, "path": str(target)}


class ModelConfigResponse(BaseModel):
    default: str
    provider: str
    base_url: str | None = None


class ModelUpdateRequest(BaseModel):
    model_name: str


@app.get("/api/profiles/{profile_name}/model", response_model=ModelConfigResponse)
def get_profile_model(profile_name: str) -> dict:
    """Get current model configuration for a profile."""
    try:
        proc = subprocess.run(
            [HERMES_BIN, "--profile", profile_name, "config", "get", "model"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if proc.returncode != 0:
            raise HTTPException(status_code=404, detail=f"Profile {profile_name} not found")

        # Parse output
        lines = proc.stdout.strip().split("\n")
        config = {}
        for line in lines:
            if ": " in line:
                key, val = line.split(": ", 1)
                config[key.strip()] = val.strip().strip("'\"")

        return {
            "default": config.get("default", ""),
            "provider": config.get("provider", "custom"),
            "base_url": config.get("base_url"),
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Profile config request timeout")
    except Exception as e:
        logger.error(f"Error getting model config for profile {profile_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def find_model_provider_info(model_name: str, profile_name: str = "default") -> dict | None:
    """Find which provider and base_url a model is configured in.
    
    Returns: {"provider": str, "base_url": str} or None if not found.
    Mirrors gateway logic: model + provider + base_url are resolved together.
    
    custom_providers is an array: [{name: ..., base_url: ..., model: ..., models: {...}}, ...]
    """
    try:
        profile_config_path = HERMES_HOME / "profiles" / profile_name / "config.yaml"
        global_config_path = HERMES_HOME / "config.yaml"
        
        # Try profile-specific config first, then fall back to global
        config_files = []
        if profile_config_path.exists():
            config_files.append(profile_config_path)
        if global_config_path.exists():
            config_files.append(global_config_path)
        
        for config_path in config_files:
            content = config_path.read_text(encoding="utf-8")
            lines = content.split("\n")
            
            # Look for custom_providers: array
            in_custom_providers = False
            provider_indent = 0
            current_entry_indent = 0
            current_provider_name = None
            current_base_url = None
            
            for i, raw_line in enumerate(lines):
                stripped = raw_line.strip()
                indent = len(raw_line) - len(raw_line.lstrip(" "))
                
                # Detect custom_providers: (array marker)
                if re.match(r"^custom_providers\s*:\s*$", stripped):
                    in_custom_providers = True
                    provider_indent = indent
                    continue
                
                if in_custom_providers:
                    # Exit custom_providers if we hit same or lower indent with non-comment
                    if indent <= provider_indent and stripped and not stripped.startswith("#"):
                        if not re.match(r"^\s*-\s", raw_line):  # Not a list item
                            in_custom_providers = False
                            continue
                    
                    # Detect array item: "  - name: RAZIX"
                    if re.match(r"^\s*-\s", raw_line):
                        # New provider entry
                        current_entry_indent = indent
                        current_provider_name = None
                        current_base_url = None
                        
                        # Try to get name from same line
                        m = re.match(r"^\s*-\s+name\s*:\s*['\"]?([^'\"#\n]+)['\"]?", raw_line)
                        if m:
                            current_provider_name = m.group(1).strip()
                        continue
                    
                    # Within a provider entry
                    if indent > current_entry_indent:
                        # Extract name:
                        if not current_provider_name:
                            m = re.match(r"^\s*name\s*:\s*['\"]?([^'\"#\n]+)['\"]?", raw_line)
                            if m:
                                current_provider_name = m.group(1).strip()
                        
                        # Extract base_url:
                        if not current_base_url:
                            m = re.match(r"^\s*base_url\s*:\s*['\"]?([^'\"#\n]+)['\"]?", raw_line)
                            if m:
                                current_base_url = m.group(1).strip()
                        
                        # Check for model: declaration
                        m = re.match(r"^\s*model\s*:\s*['\"]?([^'\"#\n]+)['\"]?", raw_line)
                        if m:
                            found_model = m.group(1).strip()
                            if found_model.lower() == model_name.lower():
                                return {
                                    "provider": current_provider_name or "custom",
                                    "base_url": current_base_url or ""
                                }
                        
                        # Check models: block
                        if re.match(r"^\s*models\s*:\s*$", raw_line):
                            # Scan following lines
                            for j in range(i + 1, len(lines)):
                                next_line = lines[j]
                                next_stripped = next_line.strip()
                                next_indent = len(next_line) - len(next_line.lstrip(" "))
                                
                                # Stop if we exit the models block
                                if next_indent <= indent:
                                    break
                                
                                # Check dict key
                                m_dict = re.match(r"^([a-zA-Z0-9_\-\./]+)\s*:", next_stripped)
                                if m_dict and m_dict.group(1).lower() == model_name.lower():
                                    return {
                                        "provider": current_provider_name or "custom",
                                        "base_url": current_base_url or ""
                                    }
        
        return None
    except Exception as e:
        logger.warning(f"Error finding model provider info for {model_name}: {e}")
        return None


def _extract_provider_base_url(lines: list[str], provider_start_line: int, base_indent: int) -> str | None:
    """Extract base_url from a provider block starting at provider_start_line."""
    try:
        for i in range(provider_start_line, min(provider_start_line + 50, len(lines))):
            line = lines[i]
            indent = len(line) - len(line.lstrip(" "))
            
            # Stop if we exit the provider block
            if line.strip() and indent <= base_indent and i > provider_start_line:
                break
            
            m = re.match(r"^\s*base_url\s*:\s*['\"]?([^'\"#\n]+)['\"]?", line)
            if m:
                return m.group(1).strip()
        
        return None
    except Exception:
        return None


@app.post("/api/profiles/{profile_name}/model")
def update_profile_model(profile_name: str, payload: ModelUpdateRequest) -> dict:
    """Update model configuration for a profile.
    
    Mirrors gateway logic: updates model.default, model.provider, and model.base_url together
    as an atomic unit by finding where the model is defined in config.yaml.
    """
    try:
        if not payload.model_name or len(payload.model_name) > 200:
            raise HTTPException(status_code=400, detail="Invalid model name")

        # Find provider and base_url for this model
        provider_info = find_model_provider_info(payload.model_name, profile_name)
        
        if not provider_info:
            logger.warning(f"Model {payload.model_name} not found in config for profile {profile_name}")
            raise HTTPException(status_code=404, detail=f"Model {payload.model_name} not found in configuration")
        
        provider = provider_info.get("provider", "custom")
        base_url = provider_info.get("base_url", "")
        
        # Update model.default
        proc = subprocess.run(
            [HERMES_BIN, "--profile", profile_name, "config", "set", "model.default", payload.model_name],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if proc.returncode != 0:
            logger.error(f"Failed to update model.default for {profile_name}: {proc.stderr}")
            raise HTTPException(status_code=500, detail=f"Failed to update model: {proc.stderr}")

        # Update model.provider
        proc = subprocess.run(
            [HERMES_BIN, "--profile", profile_name, "config", "set", "model.provider", provider],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if proc.returncode != 0:
            logger.error(f"Failed to update model.provider for {profile_name}: {proc.stderr}")
            raise HTTPException(status_code=500, detail=f"Failed to update provider: {proc.stderr}")

        # Update model.base_url if present
        if base_url:
            proc = subprocess.run(
                [HERMES_BIN, "--profile", profile_name, "config", "set", "model.base_url", base_url],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if proc.returncode != 0:
                logger.error(f"Failed to update model.base_url for {profile_name}: {proc.stderr}")
                raise HTTPException(status_code=500, detail=f"Failed to update base_url: {proc.stderr}")

        logger.info(f"Updated model for profile {profile_name} to {payload.model_name} (provider={provider}, base_url={base_url})")

        return {
            "success": True,
            "profile_name": profile_name,
            "model_name": payload.model_name,
            "provider": provider,
            "base_url": base_url,
            "message": f"Model for @{profile_name} updated to {payload.model_name}",
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Profile config request timeout")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating model config for profile {profile_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def parse_yaml_config_value(content: str, key: str) -> str | None:
    """Parse YAML config and extract a single key's value (model.default, model.provider, etc)."""
    import re
    lines = content.split("\n")
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(key + ":"):
            match = re.search(r'["\']?(.+?)["\']?\s*$', stripped)
            if match:
                return match.group(1).strip()
    return None


def get_config_yaml_model_paths() -> list[tuple[str, str]]:
    """Return list of (profile_name, config_path) with model section."""
    paths = []
    # Default profile
    default_config = HERMES_HOME / "config.yaml"
    if default_config.exists():
        paths.append(("default", str(default_config)))

    # Profile configs
    profiles_dir = HERMES_HOME / "profiles"
    if profiles_dir.exists():
        for profile_dir in profiles_dir.iterdir():
            if profile_dir.is_dir() and not profile_dir.name.startswith("."):
                config_path = profile_dir / "config.yaml"
                if config_path.exists():
                    paths.append((profile_dir.name, str(config_path)))

    return paths


def extract_models_from_yaml_content(content: str) -> set[str]:
    """Extract model names strictly from a config.yaml text content.
    Includes:
    - model.default
    - custom_providers: model and models: list/dict keys
    - moa reference_models / aggregator model
    """
    models: set[str] = set()
    lines = content.split("\n")
    
    in_models_dict = False
    models_indent = 0

    for raw_line in lines:
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        indent = len(raw_line) - len(raw_line.lstrip(" "))

        # Track when we are inside a models: block
        if re.match(r"^\s*models\s*:\s*$", raw_line):
            in_models_dict = True
            models_indent = indent
            continue

        if in_models_dict:
            if indent <= models_indent:
                in_models_dict = False
            else:
                # Capture item in models block: "model_id: {}" or "- model_id"
                m_dict = re.match(r"^\s*([a-zA-Z0-9_\-\./:]+)\s*:\s*.*$", raw_line)
                m_list = re.match(r"^\s*-\s*([a-zA-Z0-9_\-\./:]+)\s*$", raw_line)
                if m_dict:
                    val = m_dict.group(1).strip("'\"")
                    if val and not val.endswith(":"):
                        models.add(val)
                elif m_list:
                    val = m_list.group(1).strip("'\"")
                    if val:
                        models.add(val)
                continue

        # Look for explicit model: or default: declarations
        # e.g.: default: 'MiniMaxAI/MiniMax-M2.7'
        # e.g.: model: Razix-PowerFull
        m_model = re.match(r"^\s*(?:default|model)\s*:\s*['\"]?([^'\"#\n]+)['\"]?\s*$", raw_line)
        if m_model:
            val = m_model.group(1).strip()
            # Ignore booleans or system presets like 'wal' or 'auto'
            if val and val.lower() not in {"true", "false", "null", "auto", "custom", "none", "local"}:
                models.add(val)

    return models


def extract_models_from_yaml_files() -> list[str]:
    """Extract model names strictly from all config.yaml files (global + profiles)."""
    models_set: set[str] = set()
    yaml_files = get_config_yaml_model_paths()

    for profile_name, config_path in yaml_files:
        try:
            content = Path(config_path).read_text(encoding="utf-8")
            found = extract_models_from_yaml_content(content)
            models_set.update(found)
        except Exception as e:
            logger.warning(f"Failed to parse config for {profile_name} ({config_path}): {e}")

    return sorted(list(models_set))


@app.get("/api/models")
def list_available_models() -> dict:
    """Return a list of models from config.yaml (global + profiles).
    This ensures the picker only shows models that are actually configured.
    """
    models_from_yaml = extract_models_from_yaml_files()

    logger.info(f"Loaded {len(models_from_yaml)} models from config.yaml files: {models_from_yaml}")

    return {
        "models": models_from_yaml,
        "count": len(models_from_yaml),
    }


def run_task_execution(task_id: int, title: str, description: str, profile_name: str | None = None, project_info: dict | None = None) -> int:
    """
    Spawn hermes subprocess and return execution ID.
    
    Args:
        task_id: DB identifier of the task
        title: Task title
        description: Task description
        profile_name: Optional Hermes profile to attach
        project_info: Optional dict with project context (name, type, local_path, github_repo, github_url, description)
    
    Returns: execution row id (int)
    """
    now = utc_now()
    prompt = f"Task: {title}\n{description}" if description else f"Task: {title}"
    if profile_name:
        prompt += f"\n\nProfile: {profile_name}"
    
    # Embed project context so Hermes knows where to work
    if project_info:
        ctx = "\n\n**Konteks Project:**"
        ctx += f"\n- Nama project: {project_info.get('name', '')}"
        ctx += f"\n- Tipe: {project_info.get('type', '')}"
        if project_info.get('type') == 'github':
            if project_info.get('github_repo'):
                ctx += f"\n- Repository GitHub: {project_info['github_repo']}"
            if project_info.get('github_url'):
                ctx += f"\n- URL: {project_info['github_url']}"
        elif project_info.get('type') == 'local':
            if project_info.get('local_path'):
                ctx += f"\n- Lokasi lokal: {project_info['local_path']}"
        if project_info.get('description'):
            ctx += f"\n- Deskripsi project: {project_info['description']}"
        ctx += "\n\n**PENTING:** Informasi project di atas sudah tersedia. JANGAN menanyakan lagi tentang lokasi repository, nama project, atau path workspace."
        prompt += ctx
    
    hermes_bin = Path.home() / ".local" / "bin" / "hermes"
    if not hermes_bin.exists():
        raise HTTPException(status_code=500, detail="Hermes binary not found")
    
    with connect_db() as conn:
        cursor = conn.execute(
            "INSERT INTO executions (task_id, status, output, started_at) VALUES (?, ?, ?, ?)",
            (task_id, "running", "", now),
        )
        exec_id = cursor.lastrowid
        conn.commit()
    
    def execute_task() -> None:
        output_lines: list[str] = []
        try:
            proc = subprocess.Popen(
                [str(hermes_bin), "chat", "-Q", "-q", prompt],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                env={**os.environ, "HERMES_HOME": str(HERMES_HOME)},
            )
            
            if proc.stdout:
                for line in iter(proc.stdout.readline, ""):
                    if line:
                        output_lines.append(line.rstrip("\n"))
            
            proc.wait(timeout=300)
            exit_code = proc.returncode
            status = "completed" if exit_code == 0 else "failed"
        except subprocess.TimeoutExpired:
            proc.kill()
            exit_code = -1
            status = "failed"
            output_lines.append("[TIMEOUT] Task exceeded 5 minute limit")
        except Exception as e:
            exit_code = -1
            status = "failed"
            output_lines.append(f"[ERROR] {str(e)}")
        
        output_text = "\n".join(output_lines)
        finished_at = utc_now()
        
        with connect_db() as conn:
            conn.execute(
                "UPDATE executions SET status = ?, exit_code = ?, output = ?, finished_at = ? WHERE id = ?",
                (status, exit_code, output_text, finished_at, exec_id),
            )
            # Mirror execution outcome back onto the task so the board never
            # gets stuck on "in_progress" after the agent finishes.
            # Schema allows: 'planning','queued','active','blocked','done'
            task_status = "done" if exit_code == 0 else "blocked"
            conn.execute(
                "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? AND status = ?",
            (task_status, utc_now(), task_id, "active"),
            )
            conn.commit()

        publish_event(task_id, "execution.completed", f"Status: {status}, Exit: {exit_code}")
        publish_event(task_id, "task.updated", f"Status: {task_status}")
    
    import threading
    thread = threading.Thread(target=execute_task, daemon=True)
    thread.start()
    
    return exec_id


@app.post("/api/tasks/{task_id}/run")
def run_task(task_id: int) -> dict:
    """Spawn hermes execution for a task."""
    with connect_db() as conn:
        task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    now = utc_now()
    with connect_db() as conn:
        conn.execute(
            "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?",
            ("active", now, task_id),
        )
        conn.commit()
    
    project_info = None
    if task["project_id"]:
        with connect_db() as conn:
            project = conn.execute(
                "SELECT name, type, local_path, github_repo, github_url, description FROM projects WHERE id = ?",
                (task["project_id"],),
            ).fetchone()
        if project:
            project_info = dict(project)

    exec_id = run_task_execution(
        task_id,
        task["title"],
        task["description"],
        task["profile"],
        project_info=project_info,
    )
    
    publish_event(task_id, "task.started", "Execution started")
    
    return {"execution_id": exec_id, "status": "running"}


@app.get("/api/tasks/{task_id}/executions")
def list_task_executions(task_id: int) -> list[dict]:
    """List execution history for a task."""
    with connect_db() as conn:
        rows = conn.execute(
            "SELECT * FROM executions WHERE task_id = ? ORDER BY started_at DESC LIMIT 50",
            (task_id,),
        ).fetchall()
    return [row_dict(row) for row in rows]



STATIC_DIR = Path(__file__).parent.parent / "frontend" / "dist"

if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        file_path = (STATIC_DIR / full_path).resolve()
        if file_path.is_relative_to(STATIC_DIR.resolve()) and file_path.is_file():
            return FileResponse(file_path)
        if full_path.startswith("api/") or "." in Path(full_path).name:
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(STATIC_DIR / "index.html")
