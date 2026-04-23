"""Admin routes: user management, global settings, system stats."""

import json
import os
import platform
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_admin, hash_password
from ..database import get_db
from ..models import Asset, Project, ResetPasswordRequest, User, UserOut, UserUpdate
from ..routers.auth_router import set_registration_open

router = APIRouter(prefix="/admin", tags=["admin"])

SETTINGS_FILE = Path(__file__).resolve().parent.parent / "settings.json"

DEFAULT_SETTINGS = {
    "registration_open": True,
    "max_players_per_room": 10,
    "maintenance_mode": False,
    "motd": "Welcome to Eagle Game Engine!",
}


def _load_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text())
        except Exception:
            pass
    return dict(DEFAULT_SETTINGS)


def _save_settings(settings: dict):
    SETTINGS_FILE.write_text(json.dumps(settings, indent=2))


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------

@router.get("/users", response_model=list[UserOut])
async def list_users(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User))
    return result.scalars().all()


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: UserUpdate,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.is_admin is not None:
        user.is_admin = body.is_admin
    if body.is_active is not None:
        user.is_active = body.is_active
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await db.delete(user)
    await db.commit()
    return {"detail": "User deleted"}


@router.post("/users/{user_id}/reset-password")
async def reset_password(
    user_id: int,
    body: ResetPasswordRequest,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(body.new_password)
    await db.commit()
    return {"detail": "Password reset successfully"}


# ---------------------------------------------------------------------------
# Global settings
# ---------------------------------------------------------------------------

@router.get("/settings")
async def get_settings(_admin: User = Depends(get_current_admin)):
    return _load_settings()


@router.put("/settings")
async def update_settings(
    body: dict,
    _admin: User = Depends(get_current_admin),
):
    settings = _load_settings()
    settings.update(body)
    _save_settings(settings)

    # Apply runtime effects
    if "registration_open" in settings:
        set_registration_open(bool(settings["registration_open"]))

    return settings


# ---------------------------------------------------------------------------
# System stats
# ---------------------------------------------------------------------------

@router.get("/stats")
async def get_stats(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    user_count = (await db.execute(func.count(User.id))).scalar_one()
    project_count = (await db.execute(func.count(Project.id))).scalar_one()
    asset_count = (await db.execute(func.count(Asset.id))).scalar_one()
    total_asset_size = (await db.execute(func.sum(Asset.size))).scalar_one() or 0

    return {
        "users": user_count,
        "projects": project_count,
        "assets": asset_count,
        "total_asset_bytes": total_asset_size,
        "server_time": datetime.utcnow().isoformat(),
        "platform": platform.system(),
        "python_version": platform.python_version(),
    }
