"""TWIN GRID Console — FastAPI application entry point."""

import uuid as uuid_module

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.api import api_router
from app.api.v1.ws import router as ws_router
from app.api.v1.ws import start_relay
from app.core.config import settings
from app.core.database import check_db_health
from app.core.logging import setup_logging
from app.core.redis_client import check_redis_health

setup_logging()
logger = structlog.get_logger()

# Public origins derived from APP_PUBLIC_URL, used for CSP and CORS.
_public_origin = settings.APP_PUBLIC_URL.rstrip("/")
_public_ws_origin = _public_origin.replace("https://", "wss://").replace("http://", "ws://")

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    redirect_slashes=False,
    docs_url=None if not settings.APP_DEBUG else "/docs",
    redoc_url=None if not settings.APP_DEBUG else "/redoc",
)


# ── Request ID Middleware per §13.8 ─────────────────────────


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Injects a unique request_id into every request for tracing."""

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid_module.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


app.add_middleware(RequestIdMiddleware)


# ── Security Headers Middleware per §13.9 ─────────────────


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if not settings.APP_DEBUG:
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src 'self' https://fonts.gstatic.com; "
                "img-src 'self' data: https:; "
                f"connect-src 'self' {_public_origin} {_public_ws_origin}; "
                "frame-ancestors 'none';"
            )
        return response


app.add_middleware(SecurityHeadersMiddleware)


# ── CORS ────────────────────────────────────────────────────

_cors_origins = [settings.FRONTEND_URL, _public_origin]
_cors_origins += [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
if settings.APP_DEBUG:
    _cors_origins += ["http://localhost:3000", "http://127.0.0.1:3000"]
_cors_origins = [o for o in dict.fromkeys(_cors_origins) if o]  # dedupe, drop empties

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ── Global Exception Handler per §9.10 ─────────────────────


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", str(uuid_module.uuid4()))
    logger.exception(
        "unhandled_exception", error=str(exc), path=request.url.path, request_id=request_id
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred",
            },
            "request_id": request_id,
        },
    )


# ── System Endpoints ──────────────────────────────────────


@app.get("/api/v1/system/version")
async def system_version():
    return {
        "name": settings.APP_NAME,
        "version": "1.0.0",
        "commit": "dev",
    }


@app.get("/api/v1/system/health")
async def system_health():
    db_ok = await check_db_health()
    redis_ok = await check_redis_health()
    status_code = 200 if db_ok and redis_ok else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "database": "ok" if db_ok else "error",
            "redis": "ok" if redis_ok else "error",
        },
    )


# ── Include Routers ──────────────────────────────────────

app.include_router(api_router, prefix="/api/v1")
app.include_router(ws_router, prefix="/api/v1")


# ── Startup Events ──────────────────────────────────────


@app.on_event("startup")
async def startup_event():
    """Start background tasks on application startup."""
    # Start Redis pub/sub relay to bridge Binance WS events → frontend clients
    start_relay()
    logger.info("startup_complete", relay="started")

    # Setup Telegram webhook for bot notifications
    try:
        from app.core.telegram_bot import setup_webhook

        # Webhook URL uses the public frontend domain (Next.js rewrites /api/v1/* → backend)
        base_url = settings.FRONTEND_URL.rstrip("/")
        if "localhost" not in base_url:
            await setup_webhook(base_url)
            logger.info("telegram_webhook_registered")
        else:
            logger.info("telegram_webhook_skipped", reason="localhost")
    except Exception as e:
        logger.warning("telegram_webhook_setup_failed", error=str(e))
