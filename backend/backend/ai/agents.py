"""Server-side AI agent system.

Each AIAgent runs a finite-state machine:
  idle → patrol → chase → attack

The AIManager owns all agents for a room and advances them each tick.
REST endpoints allow clients to spawn agents and query their state.
"""

import asyncio
import math
import random
import time
from typing import Any

from fastapi import APIRouter

router = APIRouter(prefix="/rooms", tags=["ai"])

# ---------------------------------------------------------------------------
# AI Agent FSM
# ---------------------------------------------------------------------------

class AIState:
    IDLE = "idle"
    PATROL = "patrol"
    CHASE = "chase"
    ATTACK = "attack"
    DEAD = "dead"


class AIAgent:
    """Simple NPC with position-based FSM."""

    DETECTION_RADIUS = 15.0
    ATTACK_RADIUS = 2.5
    PATROL_RADIUS = 10.0
    MOVE_SPEED = 10.8   # 0.9 × default player walk speed (12)
    PATROL_SPEED = 3.0
    ATTACK_DAMAGE = 10
    ATTACK_COOLDOWN = 1.0  # seconds
    MAX_HEALTH = 100

    def __init__(self, agent_id: str, agent_type: str, position: dict):
        self.agent_id = agent_id
        self.agent_type = agent_type  # "zombie" | "soldier"
        self.position = dict(position)
        self.spawn_position = dict(position)
        self.health = self.MAX_HEALTH
        self.state = AIState.IDLE
        self._patrol_target: dict | None = None
        self._last_attack = 0.0
        self._idle_timer = 0.0

    # ------------------------------------------------------------------
    def tick(self, dt: float, players: dict[str, dict]) -> list[dict]:
        """Advance FSM one step. Returns list of events emitted."""
        if self.state == AIState.DEAD:
            return []

        events: list[dict] = []
        nearest_player, nearest_dist = self._nearest_player(players)

        # State transitions
        if nearest_dist < self.ATTACK_RADIUS:
            self.state = AIState.ATTACK
        elif nearest_dist < self.DETECTION_RADIUS:
            self.state = AIState.CHASE
        else:
            if self.state in (AIState.CHASE, AIState.ATTACK):
                self.state = AIState.PATROL
            elif self.state == AIState.IDLE:
                self._idle_timer -= dt
                if self._idle_timer <= 0:
                    self.state = AIState.PATROL
                    self._idle_timer = random.uniform(2, 5)

        # State actions
        if self.state == AIState.PATROL:
            events += self._do_patrol(dt)
        elif self.state == AIState.CHASE and nearest_player:
            self._move_toward(nearest_player["position"], self.MOVE_SPEED, dt)
        elif self.state == AIState.ATTACK and nearest_player:
            now = time.monotonic()
            if now - self._last_attack >= self.ATTACK_COOLDOWN:
                self._last_attack = now
                events.append({
                    "type": "ai_attack",
                    "agent_id": self.agent_id,
                    "target_id": nearest_player["player_id"],
                    "damage": self.ATTACK_DAMAGE,
                })
        elif self.state == AIState.IDLE:
            pass  # stand still

        return events

    def take_damage(self, amount: int) -> bool:
        """Returns True if agent dies."""
        self.health = max(0, self.health - amount)
        if self.health == 0:
            self.state = AIState.DEAD
            return True
        return False

    def to_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "type": self.agent_type,
            "state": self.state,
            "position": self.position,
            "health": self.health,
        }

    # ------------------------------------------------------------------
    def _nearest_player(self, players: dict) -> tuple[dict | None, float]:
        best, dist = None, math.inf
        for p in players.values():
            d = self._dist(p["position"])
            if d < dist:
                dist = d
                best = p
        return best, dist

    def _dist(self, pos: dict) -> float:
        dx = self.position["x"] - pos.get("x", 0)
        dz = self.position["z"] - pos.get("z", 0)
        return math.sqrt(dx * dx + dz * dz)

    def _move_toward(self, target: dict, speed: float, dt: float):
        dx = target.get("x", 0) - self.position["x"]
        dz = target.get("z", 0) - self.position["z"]
        length = math.sqrt(dx * dx + dz * dz) or 1
        self.position["x"] += (dx / length) * speed * dt
        self.position["z"] += (dz / length) * speed * dt

    def _do_patrol(self, dt: float) -> list[dict]:
        if self._patrol_target is None:
            angle = random.uniform(0, 2 * math.pi)
            r = random.uniform(2, self.PATROL_RADIUS)
            self._patrol_target = {
                "x": self.spawn_position["x"] + r * math.cos(angle),
                "z": self.spawn_position["z"] + r * math.sin(angle),
            }
        self._move_toward(self._patrol_target, self.PATROL_SPEED, dt)
        if self._dist(self._patrol_target) < 0.5:
            self._patrol_target = None
            self.state = AIState.IDLE
            self._idle_timer = random.uniform(1, 3)
        return []


# ---------------------------------------------------------------------------
# AI Manager (per room)
# ---------------------------------------------------------------------------

class AIManager:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.agents: dict[str, AIAgent] = {}
        self._running = False
        self._task: asyncio.Task | None = None

    def spawn(self, agent_id: str, agent_type: str, position: dict) -> AIAgent:
        agent = AIAgent(agent_id, agent_type, position)
        self.agents[agent_id] = agent
        return agent

    def get_state(self) -> list[dict]:
        return [a.to_dict() for a in self.agents.values()]

    def damage_agent(self, agent_id: str, amount: int) -> dict:
        agent = self.agents.get(agent_id)
        if not agent:
            return {"error": "Agent not found"}
        killed = agent.take_damage(amount)
        return {"agent_id": agent_id, "health": agent.health, "killed": killed}

    async def start(self, tick_rate: float = 10.0, rooms_ref: dict | None = None):
        if self._running:
            return
        self._running = True
        # Use rooms_ref if provided (even if empty); create new dict only if None
        self._task = asyncio.create_task(self._loop(tick_rate, rooms_ref if rooms_ref is not None else {}))

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

    async def _loop(self, tick_rate: float, rooms_ref: dict):
        dt = 1.0 / tick_rate
        while self._running:
            await asyncio.sleep(dt)
            player_data = {
                pid: conn["data"]
                for pid, conn in rooms_ref.get(self.room_id, {}).items()
            }
            for agent in list(self.agents.values()):
                agent.tick(dt, player_data)


# ---------------------------------------------------------------------------
# Manager registry
# ---------------------------------------------------------------------------

_managers: dict[str, AIManager] = {}


def get_manager(room_id: str, rooms_ref: dict | None = None) -> AIManager:
    if room_id not in _managers:
        mgr = AIManager(room_id)
        _managers[room_id] = mgr
        asyncio.create_task(mgr.start(rooms_ref=rooms_ref if rooms_ref is not None else {}))
    return _managers[room_id]


def get_manager_with_rooms(room_id: str, rooms_ref: dict) -> AIManager:
    """Convenience wrapper that always passes the rooms reference."""
    return get_manager(room_id, rooms_ref)

# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@router.post("/{room_id}/ai/spawn")
async def spawn_agent(room_id: str, body: dict):
    """
    Spawn an AI agent in the given room.
    Body: { agent_id, type, position: {x, y, z} }
    """
    from ..routers.multiplayer import rooms as multiplayer_rooms
    mgr = get_manager(room_id, multiplayer_rooms)
    agent_id = body.get("agent_id", f"ai_{len(mgr.agents) + 1}")
    agent_type = body.get("type", "zombie")
    position = body.get("position", {"x": 0, "y": 0, "z": 0})
    agent = mgr.spawn(agent_id, agent_type, position)
    return agent.to_dict()


@router.get("/{room_id}/ai/state")
async def get_ai_state(room_id: str):
    """Return current state of all agents in a room."""
    from ..routers.multiplayer import rooms as multiplayer_rooms
    mgr = get_manager(room_id, multiplayer_rooms)
    return mgr.get_state()


@router.post("/{room_id}/ai/{agent_id}/damage")
async def damage_agent(room_id: str, agent_id: str, body: dict):
    """Apply damage to an agent. Body: { amount }"""
    from ..routers.multiplayer import rooms as multiplayer_rooms
    mgr = get_manager(room_id, multiplayer_rooms)
    return mgr.damage_agent(agent_id, int(body.get("amount", 0)))
