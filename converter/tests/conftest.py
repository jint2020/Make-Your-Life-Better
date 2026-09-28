"""pytest fixtures：共享一个 ASGITransport 的 httpx 客户端，省得每个用例都起一次。

注意：ASGITransport 不触发 lifespan，所以健康检查一开始会是 503。
我们在模块级别手动跑一次预热，确保 /health 返回 200（和生产行为一致）。
"""

from __future__ import annotations

import asyncio
import os

import pytest
from httpx import ASGITransport, AsyncClient

# 调小并发/超时，测试跑得快一些，并且能稳定测 busy / timeout 这些场景
os.environ.setdefault("CONVERTER_CONCURRENCY", "1")
os.environ.setdefault("CONVERTER_TIMEOUT_SECONDS", "10")
os.environ.setdefault("CONVERTER_QUEUE_TIMEOUT_SECONDS", "1")
os.environ.setdefault("CONVERTER_MAX_CELLS", "50000")

from app.config import get_settings  # noqa: E402
from app.main import _run_warmup, _warm_state, create_app  # noqa: E402

get_settings.cache_clear()


@pytest.fixture(scope="session")
async def client() -> AsyncClient:
    settings = get_settings()
    # 预热：和生产一样跑一次真实转换，确保 MarkItDown / Magika 都加载好

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _run_warmup, settings)
    _warm_state.is_warm = True

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
