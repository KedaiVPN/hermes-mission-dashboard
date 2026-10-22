#!/usr/bin/env python3
"""
Safe SQLite migration for adding project_id and updating task statuses.
Backup original DB and apply schema changes without data loss.
"""
import sqlite3
import shutil
from datetime import datetime
from pathlib import Path

DB_PATH = Path("./mission.db")
BACKUP_PATH = DB_PATH.with_stem(f"mission_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}")

if not DB_PATH.exists():
    print(f"Database not found at {DB_PATH}")
    exit(1)

# Backup existing database
print(f"Backing up database to {BACKUP_PATH}...")
shutil.copy2(DB_PATH, BACKUP_PATH)
print(f"Backup created: {BACKUP_PATH}")

try:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Disable foreign keys during migration
    cursor.execute("PRAGMA foreign_keys = OFF")

    # Step 1: Create projects table first (needed for foreign key)
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
    if not cursor.fetchone():
        print("Creating projects table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL DEFAULT 'local' CHECK(type IN ('local','github')),
                local_path TEXT NOT NULL,
                github_repo TEXT,
                github_url TEXT,
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name)")
        conn.commit()
        print("✓ projects table created")

    # Step 2: Check if project_id already exists in tasks
    cursor.execute("PRAGMA table_info(tasks)")
    columns = [row[1] for row in cursor.fetchall()]

    if "project_id" not in columns:
        print("Migrating tasks table: adding project_id and updating status CHECK...")

        # Create new tasks table with updated schema
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tasks_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('planning','backlog','queued','in_progress','blocked','done')),
                profile TEXT,
                project_id INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
            )
        """)

        # Copy data from old tasks table to new
        cursor.execute("""
            INSERT INTO tasks_new (id, title, description, status, profile, project_id, created_at, updated_at)
            SELECT id, title, description, status, profile, NULL, created_at, updated_at FROM tasks
        """)

        # Drop old table
        cursor.execute("DROP TABLE tasks")

        # Rename new table to old name
        cursor.execute("ALTER TABLE tasks_new RENAME TO tasks")

        # Create index
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status_updated ON tasks(status, updated_at DESC)")

        conn.commit()
        print("✓ tasks table migrated successfully")
    else:
        print("✓ tasks table already has project_id column")

    # Verify projects table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
    if not cursor.fetchone():
        print("Creating projects table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL DEFAULT 'local' CHECK(type IN ('local','github')),
                local_path TEXT NOT NULL,
                github_repo TEXT,
                github_url TEXT,
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name)")
        conn.commit()
        print("✓ projects table created")

    # Verify prds table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='prds'")
    if not cursor.fetchone():
        print("Creating prds table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS prds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL UNIQUE,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                qa_history TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','reviewed','approved')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_prds_task ON prds(task_id)")
        conn.commit()
        print("✓ prds table created")

    # Verify task_assignments table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='task_assignments'")
    if not cursor.fetchone():
        print("Creating task_assignments table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS task_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                profile_name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'contributor',
                reason TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                UNIQUE(task_id, profile_name)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_assignments_task ON task_assignments(task_id)")
        conn.commit()
        print("✓ task_assignments table created")

    # Verify final schema
    cursor.execute("PRAGMA table_info(tasks)")
    final_columns = {row[1]: row[2] for row in cursor.fetchall()}
    print(f"\n✓ Final tasks table schema: {final_columns}")

    cursor.execute("SELECT COUNT(*) FROM tasks")
    task_count = cursor.fetchone()[0]
    print(f"✓ Data preserved: {task_count} tasks")

    conn.close()
    print("\n✅ Migration completed successfully!")
    print(f"Backup preserved at: {BACKUP_PATH}")

except Exception as e:
    print(f"❌ Migration failed: {e}")
    print(f"Restoring from backup...")
    shutil.copy2(BACKUP_PATH, DB_PATH)
    print(f"Database restored from {BACKUP_PATH}")
    exit(1)
