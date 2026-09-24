import logging

from fastapi import APIRouter, Response, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from .. import db, storage
from ..config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: str
    version: str


class Readiness(BaseModel):
    database: bool
    storage: bool


@router.get("/health", operation_id="getHealth")
async def health() -> Health:
    """存活检查：进程在就返回 ok，不检查依赖。"""
    return Health(status="ok", version=get_settings().app_version)


@router.get(
    "/health/ready",
    operation_id="getReadiness",
    responses={503: {"model": Readiness}},
)
async def ready(response: Response) -> Readiness:
    """就绪检查：数据库和对象存储都能访问才返回 200。"""
    result = Readiness(database=True, storage=True)
    try:
        await db.check_db()
    except Exception:
        logger.exception("数据库不可用")
        result.database = False
    try:
        await run_in_threadpool(storage.check_storage)
    except Exception:
        logger.exception("对象存储不可用")
        result.storage = False
    if not (result.database and result.storage):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return result
