# Hermes Mission Dashboard

Dashboard orkestrasi multi-agent Hermes dengan visualisasi Kanban real-time, manajemen profil, dan Server-Sent Events.

## Production Deployment

**Service berjalan sebagai systemd service:**

- **Public URL**: `http://103.253.245.46:8080`
- **Unit file**: `/etc/systemd/system/hermes-mission-dashboard.service`
- **Database**: `/root/hermes-mission-dashboard/backend/mission.db` (SQLite)
- **Auto-start**: Enabled (restart otomatis jika crash)

### Systemd Management

```bash
# Status service
sudo systemctl status hermes-mission-dashboard.service

# Restart service
sudo systemctl restart hermes-mission-dashboard.service

# Stop service
sudo systemctl stop hermes-mission-dashboard.service

# View logs (real-time)
sudo journalctl -u hermes-mission-dashboard.service -f

# View last 100 lines
sudo journalctl -u hermes-mission-dashboard.service -n 100
```

## Stack

- **Backend**: FastAPI + SQLite + Server-Sent Events (SSE)
- **Frontend**: React 19 + TypeScript + Vite + TanStack Query + React Flow + Tailwind CSS
- **Real-time**: SSE untuk push notifikasi task updates

## Struktur Project

```
hermes-mission-dashboard/
├── backend/
│   ├── main.py           # FastAPI app + SQLite + SSE
│   ├── requirements.txt
│   ├── .venv/           # Python 3.12 venv
│   └── mission.db       # SQLite database (auto-created)
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── types.ts
│   ├── dist/            # Production build
│   ├── package.json
│   └── tailwind.config.js
└── README.md
```

## Setup

### Backend

```bash
cd backend

# Buat venv dengan Python 3.12
/usr/bin/python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install
```

## Development

### 1. Jalankan Backend (Port 8000)

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8000
```

Backend akan:
- Membuat `mission.db` secara otomatis
- Expose API di `http://127.0.0.1:8000`
- Stream SSE events di `/api/events`

### 2. Jalankan Frontend (Port 5173)

```bash
cd frontend
npm run dev
```

Frontend akan tersedia di: **http://127.0.0.1:5173**

## API Endpoints

### REST API

```bash
# Health check
GET /api/health

# List tasks
GET /api/tasks

# Create task
POST /api/tasks
Content-Type: application/json
{
  "title": "Task Title",
  "description": "Optional description",
  "profile": "default"
}

# Update task status
PATCH /api/tasks/{id}
Content-Type: application/json
{
  "status": "backlog" | "queued" | "in_progress" | "blocked" | "done"
}

# List Hermes profiles
GET /api/profiles
```

### SSE Stream

```bash
# Real-time task events
GET /api/events
```

Events:
- `task.created` - Task baru dibuat
- `task.updated` - Status task berubah

## Test API Manually

```bash
# Health check
curl http://127.0.0.1:8000/api/health

# List profiles (detect Hermes ~/.hermes/)
curl http://127.0.0.1:8000/api/profiles

# Create task
curl -X POST http://127.0.0.1:8000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Task","description":"Build frontend","profile":"default"}'

# List tasks
curl http://127.0.0.1:8000/api/tasks

# Update status
curl -X PATCH http://127.0.0.1:8000/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}'
```

## Build Production

### Frontend

```bash
cd frontend
npm run build
```

Output: `frontend/dist/` (static files)

### Backend

Backend sudah production-ready. Deploy dengan:

```bash
cd backend
source .venv/bin/activate

# Option 1: Uvicorn
uvicorn main:app --host 0.0.0.0 --port 8000

# Option 2: Gunicorn + Uvicorn workers
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

## Features

✅ **Task Management**
- Create, update, list tasks
- Task status: backlog → queued → in_progress → blocked → done
- Optional profile assignment

✅ **Real-time Updates**
- SSE stream untuk live task changes
- Auto-refresh board saat task berubah
- Reconnection otomatis jika koneksi terputus

✅ **Hermes Integration**
- Detect profiles dari `~/.hermes/profiles/`
- Display profile status (has SOUL.md atau tidak)

✅ **Kanban Visualization**
- React Flow swimlanes per status
- Drag-drop antar kolom (UI only, backend update manual)
- Color-coded status badges

✅ **Responsive Design**
- Mobile-friendly (320px+)
- Touch targets 44px minimum
- Fluid typography dengan clamp()

## Tech Notes

### Backend

- **SQLite**: Persistent storage dengan auto-init schema
- **SSE**: Unidirectional push dari server ke client
- **CORS**: Configured untuk `http://localhost:5173`
- **Validation**: Pydantic v2 schemas dengan field validators

### Frontend

- **React 19**: Latest features + Concurrent rendering
- **TanStack Query**: Server state + auto-refetch
- **React Flow**: Kanban visualization library
- **Tailwind v4**: `@tailwindcss/postcss` plugin
- **TypeScript**: Strict typing untuk API contracts

### Design

- **Dark Technical Style**: Inspired by Linear & Trek dashboard
- **Palette**: `#0a0a0c` canvas, `#2563eb` accent, monospace fonts
- **No AI Slop**: No purple gradients, no decorative emoji, no indigo/violet defaults

## Known Limitations

- Drag-drop di board belum trigger backend update (need onDrop handler)
- SSE Last-Event-ID resume belum ditest untuk reconnection dengan cursor
- Profile assignment hanya display, belum spawn actual Hermes agent
- Authentication/authorization belum diimplementasi

## Next Steps

1. Tambah onDrop handler untuk drag-and-drop status update
2. Integrate dengan `hermes` spawning (via delegate_task atau tmux)
3. Add task description editor (markdown support)
4. Add filtering & search
5. Deploy ke VPS dengan nginx reverse proxy
6. OAuth login untuk multi-user

## License

MIT
