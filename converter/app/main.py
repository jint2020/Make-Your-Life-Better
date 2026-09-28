"""文件转 Markdown 服务：只做转换，阅后即焚。见 docs/design.md §三、§四。

契约（server 按这个契约转发请求，见 converter 交付时的报告）：
- GET /health：预热完成前 503，完成后 200 `{"status": "ok"}`
- POST /convert?ext=<ext>：请求体是文件原始字节，200 时返回
  `{"markdown": str, "warnings": list[str]}`；出错时返回 `{"code": str}`，
  状态码见 app.errors.STATUS_BY_CODE
"""

from __future__ import annotations

import asyncio
import contextlib
import dataclasses
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from . import engine, runner
from .config import Settings, get_settings
from .errors import ApiError

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = frozenset(
    {".pdf", ".docx", ".pptx", ".xlsx", ".csv", ".html", ".htm", ".epub"}
)

# 预热用的样例：走完整的子进程路径（fork、构造 MarkItDown/Magika、真的转一次），
# 但不依赖任何额外的 fixture 生成库，一个内联的小 HTML 字符串就够了。
_WARMUP_SAMPLE = b"<html><body><p>warmup</p></body></html>"
_WARMUP_EXT = ".html"


@dataclasses.dataclass
class ConvertOutcome:
    ok: bool
    markdown: str = ""
    warnings: list[str] = dataclasses.field(default_factory=list)
    code: str = "conversion_failed"


class WarmState:
    def __init__(self) -> None:
        self.is_warm = False


# 预热状态放在模块级，方便测试和生产共用同一个标记。
# 注意：模块导入时还是 False，真正的预热发生在 lifespan 里（或者测试里手动调用）。
_warm_state = WarmState()


def convert_via_subprocess(data: bytes, ext: str, settings: Settings) -> ConvertOutcome:
    """跑一次转换（子进程隔离），把 runner 的通用结果翻译成 /convert 的错误码。"""
    result = runner.run_job(
        "app.engine",
        "convert_document",
        (data, ext, settings.max_cells),
        timeout_seconds=settings.timeout_seconds,
        max_memory_mb=settings.max_memory_mb,
    )

    if result.kind == "value":
        value = result.value
        return ConvertOutcome(ok=True, markdown=value["markdown"], warnings=value["warnings"])

    if result.kind in ("killed", "crashed"):
        # 超时、超内存、或者子进程自己崩溃 / 被系统 OOM killer 杀掉，对外都是同一个提示
        return ConvertOutcome(ok=False, code="too_complex")

    exc = result.exception
    if isinstance(exc, engine.EncryptedError):
        return ConvertOutcome(ok=False, code="encrypted")
    if isinstance(exc, engine.NoTextError):
        return ConvertOutcome(ok=False, code="no_text")
    if isinstance(exc, engine.UnsupportedFormatError):
        return ConvertOutcome(ok=False, code="unsupported_format")
    return ConvertOutcome(ok=False, code="conversion_failed")


def _run_warmup(settings: Settings) -> None:
    outcome = convert_via_subprocess(_WARMUP_SAMPLE, _WARMUP_EXT, settings)
    if not outcome.ok:
        raise RuntimeError(f"预热转换失败：{outcome.code}")


async def _read_body_limited(request: Request, limit: int) -> bytes:
    """边读边检查大小，避免一次性把超大请求体读进内存再拒绝。"""
    content_length = request.headers.get("content-length")
    if content_length is not None:
        with contextlib.suppress(ValueError):
            if int(content_length) > limit:
                raise ApiError("too_large")

    total = 0
    chunks: list[bytes] = []
    async for chunk in request.stream():
        total += len(chunk)
        if total > limit:
            raise ApiError("too_large")
        chunks.append(chunk)
    return b"".join(chunks)


def create_app() -> FastAPI:
    settings = get_settings()
    semaphore = asyncio.Semaphore(settings.concurrency)
    warm_state = _warm_state

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        try:
            await run_in_threadpool(_run_warmup, settings)
            warm_state.is_warm = True
        except Exception:
            # 预热失败就不标记为健康；/health 会一直报 503，不阻止进程启动
            logger.exception("预热失败，/health 会一直返回 503")
        yield

    app = FastAPI(
        title="Make Your Life Better Converter",
        version=settings.app_version,
        lifespan=lifespan,
    )

    @app.exception_handler(ApiError)
    async def _handle_api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"code": exc.code})

    @app.get("/health", response_model=None)
    async def health() -> JSONResponse | dict[str, str]:
        if not warm_state.is_warm:
            return JSONResponse(status_code=503, content={"status": "starting"})
        return {"status": "ok"}

    @app.post("/convert")
    async def convert(request: Request, ext: str = "") -> dict[str, Any]:
        if ext not in ALLOWED_EXTENSIONS:
            raise ApiError("unsupported_format")

        data = await _read_body_limited(request, settings.max_file_bytes)

        start = time.monotonic()
        try:
            await asyncio.wait_for(semaphore.acquire(), timeout=settings.queue_timeout_seconds)
        except TimeoutError as e:
            raise ApiError("busy") from e

        try:
            outcome = await run_in_threadpool(convert_via_subprocess, data, ext, settings)
        finally:
            semaphore.release()

        duration_ms = int((time.monotonic() - start) * 1000)
        outcome_label = "ok" if outcome.ok else outcome.code
        # 只记录大小、类型、耗时和成败，不记录文件名和内容
        logger.info(
            "convert ext=%s size=%d duration_ms=%d outcome=%s",
            ext,
            len(data),
            duration_ms,
            outcome_label,
        )

        if not outcome.ok:
            raise ApiError(outcome.code)
        return {"markdown": outcome.markdown, "warnings": outcome.warnings}

    return app


app = create_app()
