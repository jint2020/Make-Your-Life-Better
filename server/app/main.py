import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool

from .config import get_settings
from .routes import auth, cloud, health
from .storage import ensure_bucket

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        await run_in_threadpool(ensure_bucket)
    except Exception:
        # 存储暂时不可用时不阻止启动，/api/health/ready 会报出来
        logger.exception("初始化对象存储失败")
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Make Your Life Better API",
        version=get_settings().app_version,
        lifespan=lifespan,
        # Caddy 原样转发 /api/*，所以接口文档也挂在 /api 下
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    app.include_router(cloud.router, prefix="/api")
    return app


app = create_app()
