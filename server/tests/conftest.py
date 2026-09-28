"""测试用真实的 PostgreSQL（单独的 mylb_test 库），对象存储和发信用内存替身。

本机先起依赖：docker compose -f docker-compose.dev.yml up -d
连不上数据库时，本机跳过需要数据库的测试；CI 里（CI=true）直接失败。
"""

import asyncio
import os
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest

TEST_DB = "mylb_test"
_base_url = os.environ.get("DATABASE_URL", "postgresql+asyncpg://mylb:mylb@localhost:5432/mylb")
_admin_url, _, _ = _base_url.rpartition("/")
os.environ["DATABASE_URL"] = f"{_admin_url}/{TEST_DB}"
os.environ["COOKIE_SECURE"] = "false"  # httpx 测试客户端走 http

from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.converter import (  # noqa: E402
    ConverterError,
    ConverterUnavailable,
    ConvertResult,
    get_converter,
)
from app.db import get_engine  # noqa: E402
from app.mailer import get_mailer  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Base  # noqa: E402
from app.rate_limit import ConvertLimiter, get_limiter  # noqa: E402
from app.storage import InMemoryObjectStore, get_object_store  # noqa: E402

get_settings.cache_clear()


class FakeMailer:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []
        self.fail = False

    async def send_login_code(self, to: str, code: str) -> None:
        if self.fail:
            raise ConnectionError("smtp down")
        self.sent.append((to, code))

    def last_code(self, to: str) -> str:
        return next(code for addr, code in reversed(self.sent) if addr == to)


class FakeConverter:
    """测试用：不转发给真的 converter 服务，按测试配置直接返回结果或抛错误。"""

    def __init__(self) -> None:
        self.calls: list[tuple[str, int]] = []
        self.result = ConvertResult(markdown="# 你好\n", warnings=[])
        self.error_code: str | None = None
        self.unavailable = False
        # 测试并发限制用：设置后 convert() 会卡在这里，等测试主动放行
        self.gate: asyncio.Event | None = None
        self.started = asyncio.Event()

    async def convert(self, ext: str, content: bytes) -> ConvertResult:
        self.calls.append((ext, len(content)))
        self.started.set()
        if self.gate is not None:
            await self.gate.wait()
        if self.unavailable:
            raise ConverterUnavailable
        if self.error_code is not None:
            raise ConverterError(self.error_code)
        return self.result


class FakeClock:
    """测试用可控时钟，配合 ConvertLimiter 的滚动窗口测试，不用真的等一小时 / 一天。"""

    def __init__(self) -> None:
        self.now = datetime(2026, 1, 1, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs: float) -> None:
        self.now += timedelta(**kwargs)


@pytest.fixture(scope="session")
async def database() -> AsyncIterator[None]:
    admin = create_async_engine(f"{_admin_url}/postgres", isolation_level="AUTOCOMMIT")
    try:
        async with admin.connect() as conn:
            exists = await conn.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": TEST_DB}
            )
            if not exists:
                await conn.execute(text(f'CREATE DATABASE "{TEST_DB}"'))
    except OSError as e:
        if os.environ.get("CI"):
            raise
        pytest.skip(f"连不上 PostgreSQL（{e}），先 docker compose -f docker-compose.dev.yml up -d")
    finally:
        await admin.dispose()

    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await get_engine().dispose()


@pytest.fixture
async def db_clean(database: None) -> None:
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    async with get_engine().begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
def mailer() -> FakeMailer:
    return FakeMailer()


@pytest.fixture
def store() -> InMemoryObjectStore:
    return InMemoryObjectStore()


@pytest.fixture
def converter() -> FakeConverter:
    return FakeConverter()


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def limiter(clock: FakeClock) -> ConvertLimiter:
    return ConvertLimiter(clock=clock)


@pytest.fixture
async def client(
    mailer: FakeMailer,
    store: InMemoryObjectStore,
    converter: FakeConverter,
    limiter: ConvertLimiter,
) -> AsyncIterator[AsyncClient]:
    app = create_app()
    app.dependency_overrides[get_mailer] = lambda: mailer
    app.dependency_overrides[get_object_store] = lambda: store
    app.dependency_overrides[get_converter] = lambda: converter
    app.dependency_overrides[get_limiter] = lambda: limiter
    # ASGITransport 不触发 lifespan，不需要真实的 MinIO
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
async def login(client: AsyncClient, mailer: FakeMailer, db_clean: None):
    """用验证码登录（第一次会自动注册），返回登录后的客户端"""

    async def _login(email: str = "alice@example.com") -> AsyncClient:
        r = await client.post("/api/auth/code", json={"email": email})
        assert r.status_code == 204, r.text
        r = await client.post(
            "/api/auth/login/code", json={"email": email, "code": mailer.last_code(email)}
        )
        assert r.status_code == 200, r.text
        return client

    return _login
