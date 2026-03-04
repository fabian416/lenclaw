"""Lenclaw - AI Agent Lending Protocol API."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse

from src.agent.router import router as agent_router
from src.auth.dependencies import init_auth_service
from src.auth.router import router as auth_router
from src.auth.service import AuthService
from src.bridge.router import router as bridge_router
from src.common.config import load_settings
from src.common.exceptions import LenclawError
from src.credit.router import router as credit_router
from src.db.session import close_db, init_db
from src.monitoring.router import router as monitoring_router
from src.pool.router import router as pool_router
from src.market.router import router as market_router
from src.revenue.router import router as revenue_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = load_settings()

    # Initialize database
    init_db(settings.database)
    logger.info("Database initialized (env=%s)", settings.env)

    # Initialize auth service
    auth_service = AuthService(settings.auth)
    init_auth_service(auth_service)

    yield

    # Cleanup
    await close_db()
    logger.info("Database connections closed")


def create_app() -> FastAPI:
    settings = load_settings()

    app = FastAPI(
        title="Lenclaw API",
        description="AI Agent Lending Protocol - Credit infrastructure for AI agents",
        version="0.1.0",
        lifespan=lifespan,
        default_response_class=ORJSONResponse,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Exception handlers
    @app.exception_handler(LenclawError)
    async def lenclaw_error_handler(request: Request, exc: LenclawError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.message},
        )

    # Health check
    @app.get("/health", tags=["system"])
    async def health():
        return {"status": "ok", "service": "lenclaw"}

    # Include routers
    api_prefix = "/api/v1"
    app.include_router(auth_router, prefix=api_prefix)
    app.include_router(agent_router, prefix=api_prefix)
    app.include_router(revenue_router, prefix=api_prefix)
    app.include_router(credit_router, prefix=api_prefix)
    app.include_router(pool_router, prefix=api_prefix)
    app.include_router(market_router, prefix=api_prefix)
    app.include_router(bridge_router, prefix=api_prefix)
    app.include_router(monitoring_router, prefix=api_prefix)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
