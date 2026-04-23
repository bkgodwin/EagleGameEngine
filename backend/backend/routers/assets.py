"""Asset routes: upload, list, delete, built-in library."""

import os
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import Asset, AssetOut, User

router = APIRouter(prefix="/assets", tags=["assets"])

UPLOADS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB per file
MAX_TOTAL_QUOTA_BYTES = 200 * 1024 * 1024  # 200 MB per user

# Built-in asset library (20 items)
ASSET_LIBRARY = [
    {"id": f"lib_{i}", "name": name, "type": t, "url": f"/api/assets/library/{i}"}
    for i, (name, t) in enumerate([
        ("Grass Texture", "texture"),
        ("Stone Texture", "texture"),
        ("Wood Planks", "texture"),
        ("Dirt Texture", "texture"),
        ("Sand Texture", "texture"),
        ("Brick Wall", "texture"),
        ("Gravel Texture", "texture"),
        ("Metal Panel", "texture"),
        ("Concrete", "texture"),
        ("Lava Texture", "texture"),
        ("Water Normal", "texture"),
        ("Snow Texture", "texture"),
        ("Marble Texture", "texture"),
        ("Bark Texture", "texture"),
        ("Roof Tiles", "texture"),
        ("Rock Heightmap", "heightmap"),
        ("Desert Heightmap", "heightmap"),
        ("Valley Heightmap", "heightmap"),
        ("Mountain Heightmap", "heightmap"),
        ("Island Heightmap", "heightmap"),
    ], start=1)
]


@router.get("/library")
async def get_library():
    return ASSET_LIBRARY


@router.post("/upload", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
async def upload_asset(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check per-file size
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

    # Check total quota
    result = await db.execute(
        select(func.sum(Asset.size)).where(Asset.owner_id == current_user.id)
    )
    total_used = result.scalar_one() or 0
    if total_used + len(content) > MAX_TOTAL_QUOTA_BYTES:
        raise HTTPException(status_code=413, detail="Storage quota exceeded (200 MB)")

    # Save file
    ext = Path(file.filename or "").suffix or ""
    unique_name = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOADS_DIR / unique_name
    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    asset = Asset(
        filename=unique_name,
        original_name=file.filename or unique_name,
        content_type=file.content_type or "application/octet-stream",
        size=len(content),
        owner_id=current_user.id,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.get("", response_model=list[AssetOut])
async def list_assets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Asset).where(Asset.owner_id == current_user.id))
    return result.scalars().all()


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.owner_id == current_user.id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Delete from disk
    dest = UPLOADS_DIR / asset.filename
    if dest.exists():
        dest.unlink()

    await db.delete(asset)
    await db.commit()


@router.get("/file/{asset_id}")
async def serve_asset(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.owner_id == current_user.id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    dest = UPLOADS_DIR / asset.filename
    if not dest.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(str(dest), media_type=asset.content_type, filename=asset.original_name)
