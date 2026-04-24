"""Eagle Game Engine – FastAPI backend entry-point.

Run with:
    cd backend
    pip install -r requirements.txt
    uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

Default admin account:  admin@eagle.local / admin123
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .auth import hash_password
from .database import AsyncSessionLocal, Base, engine
from .models import User
from .routers import admin, assets, auth_router, multiplayer, projects
from .ai.agents import router as ai_router
from sqlalchemy import select

logger = logging.getLogger(__name__)

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create DB tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed admin user
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == "admin@eagle.local"))
        if not result.scalar_one_or_none():
            admin_user = User(
                email="admin@eagle.local",
                username="admin",
                hashed_password=hash_password("admin123"),
                is_admin=True,
            )
            db.add(admin_user)
            await db.commit()
            logger.info("Seeded default admin user: admin@eagle.local / admin123")

    yield

    # Clean up DB connections
    await engine.dispose()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Eagle Game Engine API",
    description="Backend for the Eagle browser-based 3D game engine and level editor.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS – allow the Vite dev server and all LAN origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# API routers
# ---------------------------------------------------------------------------

app.include_router(auth_router.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(multiplayer.router, prefix="/api")
app.include_router(ai_router, prefix="/api")

# ---------------------------------------------------------------------------
# Serve compiled frontend (production)
# ---------------------------------------------------------------------------

if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="static")
