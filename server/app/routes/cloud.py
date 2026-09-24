"""云端任务：用户主动保存的原始文件 + 配置。服务端只存，不解析、不计算。"""

import json
import logging
import uuid
from datetime import datetime
from typing import Annotated, Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select

from ..auth import CurrentUser, DbSession
from ..config import get_settings
from ..models import CloudFile, CloudTask, User
from ..storage import ObjectStore, get_object_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cloud", tags=["cloud"])

Store = Annotated[ObjectStore, Depends(get_object_store)]


class Usage(BaseModel):
    used_bytes: int
    quota_bytes: int
    task_count: int
    max_tasks: int
    max_file_bytes: int
    max_files_per_task: int


class CloudFileOut(BaseModel):
    id: uuid.UUID
    name: str
    size: int
    content_type: str


class CloudTaskSummary(BaseModel):
    id: uuid.UUID
    tool_id: str
    name: str
    total_bytes: int
    created_at: datetime
    files: list[CloudFileOut]


class CloudTaskDetail(CloudTaskSummary):
    config: dict[str, Any]


def to_summary(task: CloudTask) -> CloudTaskSummary:
    return CloudTaskSummary(
        id=task.id,
        tool_id=task.tool_id,
        name=task.name,
        total_bytes=task.total_bytes,
        created_at=task.created_at,
        files=[
            CloudFileOut(id=f.id, name=f.name, size=f.size, content_type=f.content_type)
            for f in task.files
        ],
    )


def to_detail(task: CloudTask) -> CloudTaskDetail:
    return CloudTaskDetail(**to_summary(task).model_dump(), config=task.config)


async def _usage(db: DbSession, user_id: uuid.UUID) -> tuple[int, int]:
    row = (
        await db.execute(
            select(func.coalesce(func.sum(CloudTask.total_bytes), 0), func.count()).where(
                CloudTask.user_id == user_id
            )
        )
    ).one()
    return int(row[0]), int(row[1])


async def _get_task(db: DbSession, user: User, task_id: uuid.UUID) -> CloudTask:
    task = await db.scalar(
        select(CloudTask).where(CloudTask.id == task_id, CloudTask.user_id == user.id)
    )
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "任务不存在或已删除")
    return task


@router.get("/usage", operation_id="getCloudUsage")
async def usage(user: CurrentUser, db: DbSession) -> Usage:
    s = get_settings()
    used, count = await _usage(db, user.id)
    return Usage(
        used_bytes=used,
        quota_bytes=s.user_quota_bytes,
        task_count=count,
        max_tasks=s.user_max_tasks,
        max_file_bytes=s.max_file_bytes,
        max_files_per_task=s.max_files_per_task,
    )


@router.get("/tasks", operation_id="listCloudTasks")
async def list_tasks(
    user: CurrentUser, db: DbSession, tool_id: str | None = None
) -> list[CloudTaskSummary]:
    query = select(CloudTask).where(CloudTask.user_id == user.id)
    if tool_id:
        query = query.where(CloudTask.tool_id == tool_id)
    tasks = await db.scalars(query.order_by(CloudTask.created_at.desc()))
    return [to_summary(t) for t in tasks]


@router.post(
    "/tasks",
    operation_id="createCloudTask",
    status_code=status.HTTP_201_CREATED,
    responses={
        409: {"description": "超出额度"},
        413: {"description": "文件太大"},
        422: {"description": "参数不对"},
    },
)
async def create_task(
    user: CurrentUser,
    db: DbSession,
    store: Store,
    tool_id: Annotated[str, Form(min_length=1, max_length=64)],
    name: Annotated[str, Form(min_length=1, max_length=200)],
    config: Annotated[str, Form(description="任务配置，JSON 对象")],
    files: Annotated[list[UploadFile], File()],
) -> CloudTaskDetail:
    s = get_settings()

    if len(config.encode()) > s.max_config_bytes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "配置太大")
    try:
        config_obj = json.loads(config)
    except json.JSONDecodeError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "配置不是合法的 JSON") from e
    if not isinstance(config_obj, dict):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "配置必须是 JSON 对象")

    if not 1 <= len(files) <= s.max_files_per_task:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"一次要上传 1～{s.max_files_per_task} 个文件"
        )
    for f in files:
        if f.size is None or f.size > s.max_file_bytes:
            limit = s.max_file_bytes // (1024 * 1024)
            raise HTTPException(
                status.HTTP_413_CONTENT_TOO_LARGE,
                f"文件“{f.filename}”超过 {limit} MB，不能保存到云端",
            )
    total = sum(f.size or 0 for f in files)

    # 锁住用户行，避免并发上传同时通过额度检查
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    used, count = await _usage(db, user.id)
    if count >= s.user_max_tasks:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"云端最多保存 {s.user_max_tasks} 个任务，请先删除一些旧任务"
        )
    if used + total > s.user_quota_bytes:
        raise HTTPException(status.HTTP_409_CONFLICT, "云端空间不够了，请先删除一些旧任务")

    task = CloudTask(
        id=uuid.uuid4(),
        user_id=user.id,
        tool_id=tool_id,
        name=name,
        config=config_obj,
        total_bytes=total,
    )
    uploaded: list[str] = []
    try:
        for i, f in enumerate(files):
            file_id = uuid.uuid4()
            key = f"users/{user.id}/tasks/{task.id}/{file_id}"
            content_type = f.content_type or "application/octet-stream"
            await run_in_threadpool(store.put, key, f.file, content_type)
            uploaded.append(key)
            task.files.append(
                CloudFile(
                    id=file_id,
                    position=i,
                    name=(f.filename or f"文件{i + 1}")[:255],
                    size=f.size or 0,
                    content_type=content_type,
                    object_key=key,
                )
            )
        db.add(task)
        await db.commit()
    except Exception:
        await db.rollback()
        await run_in_threadpool(store.delete_many, uploaded)
        raise
    await db.refresh(task)
    return to_detail(task)


@router.get("/tasks/{task_id}", operation_id="getCloudTask", responses={404: {}})
async def get_task(task_id: uuid.UUID, user: CurrentUser, db: DbSession) -> CloudTaskDetail:
    return to_detail(await _get_task(db, user, task_id))


@router.get(
    "/tasks/{task_id}/files/{file_id}",
    operation_id="downloadCloudFile",
    response_class=StreamingResponse,
    responses={200: {"content": {"application/octet-stream": {}}}, 404: {}},
)
async def download_file(
    task_id: uuid.UUID, file_id: uuid.UUID, user: CurrentUser, db: DbSession, store: Store
) -> StreamingResponse:
    task = await _get_task(db, user, task_id)
    file = next((f for f in task.files if f.id == file_id), None)
    if file is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "文件不存在")
    return StreamingResponse(
        store.iter_chunks(file.object_key),
        media_type=file.content_type,
        headers={
            "Content-Length": str(file.size),
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(file.name)}",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete(
    "/tasks/{task_id}",
    operation_id="deleteCloudTask",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {}},
)
async def delete_task(task_id: uuid.UUID, user: CurrentUser, db: DbSession, store: Store) -> None:
    task = await _get_task(db, user, task_id)
    keys = [f.object_key for f in task.files]
    await db.delete(task)
    await db.commit()
    # 先删记录再删文件：删文件失败只会留下孤儿对象，不会出现"有记录没文件"
    try:
        await run_in_threadpool(store.delete_many, keys)
    except Exception:
        logger.exception("删除云端文件失败，留下了孤儿对象：%s", keys)
