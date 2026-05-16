from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path

from app.api.routes import router as api_router
from app.api.views import router as view_router

BASE_DIR = Path(__file__).resolve().parent


def create_app() -> FastAPI:
    app = FastAPI(
        title="Sprich Mal! – German Speaking Practice",
        description="AI-powered speaking practice for German beginners (A1–A2)",
        version="1.0.0",
    )

    # Mount static files
    app.mount(
        "/static",
        StaticFiles(directory=BASE_DIR / "static"),
        name="static",
    )

    # Register routers
    app.include_router(view_router)
    app.include_router(api_router, prefix="/api")

    return app
