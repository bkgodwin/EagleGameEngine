"""WebSocket multiplayer room system.

Rooms support up to MAX_PLAYERS_PER_ROOM players.
Each player sends JSON messages; server broadcasts world state.

Message types (client → server):
  join       { type, room_id, player_id, username }
  update     { type, player_id, position, rotation, health }
  shoot      { type, player_id, origin, direction }
  damage     { type, target_id, amount, attacker_id }
  respawn    { type, player_id, position }
  chat       { type, player_id, username, text }
  leave      { type, player_id }

Message types (server → client):
  room_state { type, players }
  player_joined { type, player }
  player_left { type, player_id }
  shoot_event { type, ... }
  damage_event { type, ... }
  respawn_event { type, ... }
  chat_message { type, ... }
  error       { type, detail }
"""

import json
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(prefix="/multiplayer", tags=["multiplayer"])

MAX_PLAYERS_PER_ROOM = 10

# rooms: { room_id: { player_id: { ws, data } } }
rooms: dict[str, dict[str, dict]] = {}


async def _broadcast(room_id: str, message: dict, exclude: str | None = None):
    if room_id not in rooms:
        return
    dead = []
    for pid, conn in rooms[room_id].items():
        if pid == exclude:
            continue
        try:
            await conn["ws"].send_text(json.dumps(message))
        except Exception:
            dead.append(pid)
    for pid in dead:
        rooms[room_id].pop(pid, None)


async def _send(ws: WebSocket, message: dict):
    await ws.send_text(json.dumps(message))


@router.websocket("/ws/{room_id}")
async def multiplayer_ws(websocket: WebSocket, room_id: str):
    await websocket.accept()

    player_id: str | None = None

    try:
        async for raw in websocket.iter_text():
            try:
                msg: dict[str, Any] = json.loads(raw)
            except json.JSONDecodeError:
                await _send(websocket, {"type": "error", "detail": "Invalid JSON"})
                continue

            msg_type = msg.get("type", "")

            if msg_type == "join":
                pid = str(msg.get("player_id", ""))
                if not pid:
                    await _send(websocket, {"type": "error", "detail": "player_id required"})
                    continue

                # Initialise room
                if room_id not in rooms:
                    rooms[room_id] = {}

                if len(rooms[room_id]) >= MAX_PLAYERS_PER_ROOM:
                    await _send(websocket, {"type": "error", "detail": "Room is full"})
                    await websocket.close()
                    return

                player_id = pid
                player_data = {
                    "player_id": pid,
                    "username": msg.get("username", pid),
                    "position": {"x": 0, "y": 1, "z": 0},
                    "rotation": {"y": 0},
                    "health": 100,
                }
                rooms[room_id][pid] = {"ws": websocket, "data": player_data}

                # Send current room state to the joiner
                await _send(websocket, {
                    "type": "room_state",
                    "players": [c["data"] for c in rooms[room_id].values()],
                })

                # Notify others
                await _broadcast(room_id, {"type": "player_joined", "player": player_data}, exclude=pid)

            elif msg_type == "update":
                pid = str(msg.get("player_id", player_id or ""))
                if pid and room_id in rooms and pid in rooms[room_id]:
                    rooms[room_id][pid]["data"].update({
                        "position": msg.get("position", rooms[room_id][pid]["data"]["position"]),
                        "rotation": msg.get("rotation", rooms[room_id][pid]["data"]["rotation"]),
                        "health": msg.get("health", rooms[room_id][pid]["data"]["health"]),
                    })
                    await _broadcast(room_id, {
                        "type": "player_update",
                        "player_id": pid,
                        "position": rooms[room_id][pid]["data"]["position"],
                        "rotation": rooms[room_id][pid]["data"]["rotation"],
                        "health": rooms[room_id][pid]["data"]["health"],
                    }, exclude=pid)

            elif msg_type == "shoot":
                await _broadcast(room_id, {
                    "type": "shoot_event",
                    "player_id": msg.get("player_id", player_id),
                    "origin": msg.get("origin"),
                    "direction": msg.get("direction"),
                }, exclude=str(msg.get("player_id", player_id or "")))

            elif msg_type == "damage":
                target_id = str(msg.get("target_id", ""))
                amount = int(msg.get("amount", 0))
                if room_id in rooms and target_id in rooms[room_id]:
                    target_data = rooms[room_id][target_id]["data"]
                    target_data["health"] = max(0, target_data["health"] - amount)
                    await _broadcast(room_id, {
                        "type": "damage_event",
                        "target_id": target_id,
                        "attacker_id": msg.get("attacker_id", player_id),
                        "amount": amount,
                        "health": target_data["health"],
                    })

            elif msg_type == "respawn":
                pid = str(msg.get("player_id", player_id or ""))
                pos = msg.get("position", {"x": 0, "y": 1, "z": 0})
                if room_id in rooms and pid in rooms[room_id]:
                    rooms[room_id][pid]["data"]["health"] = 100
                    rooms[room_id][pid]["data"]["position"] = pos
                    await _broadcast(room_id, {
                        "type": "respawn_event",
                        "player_id": pid,
                        "position": pos,
                    })

            elif msg_type == "chat":
                await _broadcast(room_id, {
                    "type": "chat_message",
                    "player_id": msg.get("player_id", player_id),
                    "username": msg.get("username", player_id),
                    "text": msg.get("text", ""),
                })

            elif msg_type == "leave":
                break

    except WebSocketDisconnect:
        pass
    finally:
        if player_id and room_id in rooms:
            rooms[room_id].pop(player_id, None)
            if not rooms[room_id]:
                del rooms[room_id]
            else:
                await _broadcast(room_id, {"type": "player_left", "player_id": player_id})


@router.get("/rooms")
async def list_rooms():
    """List active rooms and player counts (public endpoint for lobby)."""
    return [
        {"room_id": rid, "player_count": len(conns)}
        for rid, conns in rooms.items()
    ]
