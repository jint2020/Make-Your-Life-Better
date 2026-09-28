"""文件转 Markdown：唯一会把文件传到服务器的工具，转完立即删除（见 docs/design.md 第三节）。

阅后即焚：这里绝不能把文件内容或文件名写进日志、数据库或对象存储；只记录大小、扩展名、耗时和结果。
真正的转换在独立的 converter 服务里做（见 app/converter.py），这里只负责登录校验、扩展名白名单、
大小限制、并发和频率限制，然后转发。
"""

import logging
import time
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from ..auth import CurrentUser
from ..config import get_settings
from ..converter import (
    ConverterClient,
    ConverterError,
    ConverterUnavailable,
    ConvertResult,
    get_converter,
)
from ..rate_limit import ConvertLimiter, get_limiter

logger = logging.getLogger(__name__)

router = APIRouter(tags=["convert"])

READ_CHUNK_BYTES = 1024 * 1024

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".xlsx", ".csv", ".html", ".htm", ".epub"}

# markitdown 不支持这些旧格式；给出具体的另存为提示，而不是笼统的"不支持这种格式"
LEGACY_EXTENSION_MESSAGES = {
    ".doc": "暂不支持 .doc，请用 Word 另存为 .docx 后再转换",
    ".ppt": "暂不支持 .ppt，请用 PowerPoint 另存为 .pptx 后再转换",
    ".xls": "暂不支持 .xls，请用 Excel 另存为 .xlsx 后再转换",
}

UNSUPPORTED_FORMAT_MESSAGE = "暂不支持这种格式"


def _check_extension(filename: str | None) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext in ALLOWED_EXTENSIONS:
        return ext
    if ext in LEGACY_EXTENSION_MESSAGES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, LEGACY_EXTENSION_MESSAGES[ext])
    raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, UNSUPPORTED_FORMAT_MESSAGE)


async def _read_within_limit(file: UploadFile, limit: int, too_large_message: str) -> bytes:
    """按块读取，最多读到 limit + 1 字节就能判断超限，不会把整个超大文件读进内存。"""
    chunks: list[bytes] = []
    total = 0
    while total <= limit:
        chunk = await file.read(min(READ_CHUNK_BYTES, limit + 1 - total))
        if not chunk:
            break
        total += len(chunk)
        chunks.append(chunk)
    if total > limit:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, too_large_message)
    return b"".join(chunks)


def _map_converter_error(code: str, too_large_message: str) -> HTTPException:
    if code == "encrypted":
        return HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "文件有密码保护，请先去掉密码再转换"
        )
    if code == "no_text":
        return HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "没有可提取的文字，可能是扫描件或图片，暂不支持"
        )
    if code == "conversion_failed":
        return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "文件无法解析，可能已损坏")
    if code == "too_complex":
        return HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "文件太大或太复杂，转换超时或内存不足"
        )
    if code == "unsupported_format":
        return HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, UNSUPPORTED_FORMAT_MESSAGE)
    if code == "too_large":
        return HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, too_large_message)
    if code == "busy":
        return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "转换服务繁忙，请稍后重试")
    # 未知错误码：按"连不上"处理，而不是把内部代码暴露给用户
    return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "转换服务暂不可用，请稍后再试")


@router.post(
    "/convert",
    operation_id="convertFile",
    responses={
        401: {"description": "未登录"},
        413: {"description": "文件太大"},
        415: {"description": "不支持的格式"},
        422: {"description": "转换失败"},
        429: {"description": "上一个还在转换，或者转换太频繁"},
        503: {"description": "转换服务不可用"},
    },
)
async def convert_file(
    user: CurrentUser,
    converter: Annotated[ConverterClient, Depends(get_converter)],
    limiter: Annotated[ConvertLimiter, Depends(get_limiter)],
    file: Annotated[UploadFile, File()],
) -> ConvertResult:
    """把上传的文件转换成 Markdown。文件只在内存里处理，响应返回后不留任何痕迹。"""
    s = get_settings()
    ext = _check_extension(file.filename)
    too_large_message = f"文件超过 {s.convert_max_file_bytes // (1024 * 1024)} MB"
    content = await _read_within_limit(file, s.convert_max_file_bytes, too_large_message)

    limiter.acquire(user.id)
    started = time.monotonic()
    outcome = "unknown"
    try:
        try:
            result = await converter.convert(ext, content)
        except ConverterError as e:
            outcome = e.code
            if e.code != "busy":
                limiter.record(user.id)
            raise _map_converter_error(e.code, too_large_message) from e
        except ConverterUnavailable as e:
            outcome = "unavailable"
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE, "转换服务暂不可用，请稍后再试"
            ) from e
        else:
            outcome = "ok"
            limiter.record(user.id)
            return result
    finally:
        limiter.release(user.id)
        duration_ms = int((time.monotonic() - started) * 1000)
        # 只记大小、类型、耗时和结果，绝不记文件名或内容
        logger.info(
            "文件转 Markdown：ext=%s size=%d duration_ms=%d outcome=%s",
            ext,
            len(content),
            duration_ms,
            outcome,
        )
