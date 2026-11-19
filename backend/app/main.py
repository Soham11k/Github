from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import get_settings
from app.db import close_pool, init_pool
from app.rate_limit import limiter
from app.routers.accounts import router as accounts_router
from app.routers.api import router as api_router
from app.routers.auth import router as auth_router


def _configure_sentry() -> None:
    settings = get_settings()
    if not settings.sentry_dsn:
        return
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.05,
        send_default_pii=False,
        environment=settings.app_env,
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    if settings.is_production:
        origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
        if not origins:
            raise RuntimeError("CORS_ORIGINS must be set when APP_ENV=production")
        if not settings.session_secret or settings.session_secret.startswith("dev-"):
            raise RuntimeError("SESSION_SECRET must be a strong secret in production")
    init_pool()
    yield
    close_pool()


def create_app() -> FastAPI:
    settings = get_settings()
    _configure_sentry()

    app = FastAPI(
        title=settings.app_name,
        description="Open source repository intelligence — PostgreSQL analytics on public GitHub data",
        version="2.0.0",
        lifespan=lifespan,
    )
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    if settings.is_production and not origins:
        allow = []
    elif origins:
        allow = origins
    else:
        allow = ["*"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(api_router)
    app.include_router(auth_router)
    app.include_router(accounts_router)

    @app.get("/")
    @limiter.limit(settings.rate_limit_read)
    def root(request: Request) -> dict[str, str]:
        return {"service": settings.app_name, "docs": "/docs", "health": "/api/health"}

    return app


app = create_app()
