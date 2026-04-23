# Eagle Game Engine – Backend

Python FastAPI backend for the Eagle Game Engine browser-based 3D level editor.

## Quick Start

```bash
cd backend
pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Open http://localhost:8000 (serves built frontend from `frontend/dist`) or
point your Vite dev server at `http://localhost:8000/api`.

**Default admin account:** `admin@eagle.local` / `admin123`
> Change the admin password immediately after first login.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `EAGLE_SECRET_KEY` | `eagle-game-engine-secret-key-change-in-production` | JWT signing secret – **set this in production** |

## API Overview

| Prefix | Description |
|---|---|
| `POST /api/auth/login` | OAuth2 password-form login → JWT |
| `POST /api/auth/signup` | New user registration |
| `GET  /api/auth/me` | Current user profile |
| `POST /api/auth/change-password` | Change own password |
| `GET/POST /api/projects` | List / create projects |
| `GET/PUT/DELETE /api/projects/{id}` | Read / update / delete project |
| `GET /api/projects/{id}/export` | Download project as JSON |
| `POST /api/assets/upload` | Upload asset (max 20 MB, 200 MB total quota) |
| `GET  /api/assets` | List own assets |
| `DELETE /api/assets/{id}` | Delete asset |
| `GET  /api/assets/library` | Built-in 20-item asset library |
| `GET  /api/admin/users` | *(admin)* List users |
| `PUT  /api/admin/users/{id}` | *(admin)* Update user |
| `DELETE /api/admin/users/{id}` | *(admin)* Delete user |
| `POST /api/admin/users/{id}/reset-password` | *(admin)* Reset user password |
| `GET/PUT /api/admin/settings` | *(admin)* Global settings |
| `GET  /api/admin/stats` | *(admin)* System statistics |
| `WS   /api/multiplayer/ws/{room_id}` | WebSocket multiplayer room |
| `GET  /api/multiplayer/rooms` | Active room list |
| `POST /api/rooms/{room_id}/ai/spawn` | Spawn AI agent in room |
| `GET  /api/rooms/{room_id}/ai/state` | AI agent states |
| `POST /api/rooms/{room_id}/ai/{agent_id}/damage` | Damage an AI agent |

Full interactive docs: http://localhost:8000/docs

## Architecture

```
backend/
├── main.py           # FastAPI app, CORS, lifespan (DB init + admin seed)
├── database.py       # Async SQLite via SQLAlchemy 2.x
├── models.py         # ORM models (User, Project, Asset) + Pydantic schemas
├── auth.py           # JWT helpers, bcrypt, FastAPI dependencies
├── settings.json     # Persisted global settings (created on first run)
├── eagle.db          # SQLite database (created on first run)
├── uploads/          # User-uploaded asset files
├── routers/
│   ├── auth_router.py   # /api/auth/*
│   ├── projects.py      # /api/projects/*
│   ├── assets.py        # /api/assets/*
│   ├── admin.py         # /api/admin/*
│   └── multiplayer.py   # /api/multiplayer/ws/{room_id}
└── ai/
    └── agents.py        # FSM AI agents + /api/rooms/{id}/ai/*
```

## WebSocket Protocol

Connect to `ws://localhost:8000/api/multiplayer/ws/{room_id}`.

### Client → Server messages

```json
{ "type": "join",    "room_id": "r1", "player_id": "p1", "username": "Alice" }
{ "type": "update",  "player_id": "p1", "position": {"x":0,"y":1,"z":0}, "rotation": {"y":0}, "health": 100 }
{ "type": "shoot",   "player_id": "p1", "origin": {...}, "direction": {...} }
{ "type": "damage",  "target_id": "p2", "amount": 10, "attacker_id": "p1" }
{ "type": "respawn", "player_id": "p1", "position": {"x":0,"y":1,"z":0} }
{ "type": "chat",    "player_id": "p1", "username": "Alice", "text": "Hello!" }
{ "type": "leave" }
```

### Server → Client messages

```json
{ "type": "room_state",    "players": [...] }
{ "type": "player_joined", "player": {...} }
{ "type": "player_left",   "player_id": "p2" }
{ "type": "player_update", "player_id": "p2", "position": {...}, "rotation": {...}, "health": 95 }
{ "type": "shoot_event",   "player_id": "p1", "origin": {...}, "direction": {...} }
{ "type": "damage_event",  "target_id": "p2", "attacker_id": "p1", "amount": 10, "health": 90 }
{ "type": "respawn_event", "player_id": "p1", "position": {...} }
{ "type": "chat_message",  "player_id": "p1", "username": "Alice", "text": "Hello!" }
{ "type": "error",         "detail": "Room is full" }
```
