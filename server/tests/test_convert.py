import asyncio

import pytest
from httpx import AsyncClient

from app.config import get_settings
from app.converter import ConvertResult
from app.rate_limit import ConvertLimiter

from .conftest import FakeClock, FakeConverter

pytestmark = pytest.mark.usefixtures("db_clean")


def _upload(ext: str = ".csv", content: bytes = b"a,b\n1,2\n") -> dict:
    return {"file": (f"data{ext}", content, "application/octet-stream")}


async def test_requires_login(client: AsyncClient) -> None:
    r = await client.post("/api/convert", files=_upload())
    assert r.status_code == 401


async def test_rejects_unsupported_extension(login, client: AsyncClient) -> None:
    await login()
    r = await client.post("/api/convert", files=_upload(".png", b"\x89PNG"))
    assert r.status_code == 415
    assert r.json()["detail"] == "暂不支持这种格式"


@pytest.mark.parametrize(
    ("ext", "message"),
    [
        (".doc", "暂不支持 .doc，请用 Word 另存为 .docx 后再转换"),
        (".ppt", "暂不支持 .ppt，请用 PowerPoint 另存为 .pptx 后再转换"),
        (".xls", "暂不支持 .xls，请用 Excel 另存为 .xlsx 后再转换"),
    ],
)
async def test_legacy_extensions_get_specific_message(
    login, client: AsyncClient, ext: str, message: str
) -> None:
    await login()
    r = await client.post("/api/convert", files=_upload(ext, b"whatever"))
    assert r.status_code == 415
    assert r.json()["detail"] == message


async def test_extension_check_is_case_insensitive(
    login, client: AsyncClient, converter: FakeConverter
) -> None:
    await login()
    r = await client.post("/api/convert", files=_upload(".PDF", b"%PDF-1.4"))
    assert r.status_code == 200
    assert converter.calls == [(".pdf", 8)]


async def test_oversize_file_rejected(
    login, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "convert_max_file_bytes", 10)
    await login()
    r = await client.post("/api/convert", files=_upload(".csv", b"x" * 20))
    assert r.status_code == 413
    assert r.json()["detail"] == "文件超过 0 MB"


async def test_success_returns_markdown_and_warnings(
    login, client: AsyncClient, converter: FakeConverter
) -> None:
    converter.result = ConvertResult(markdown="# 标题\n\n正文", warnings=["table_truncated"])
    await login()
    r = await client.post("/api/convert", files=_upload())
    assert r.status_code == 200
    assert r.json() == {"markdown": "# 标题\n\n正文", "warnings": ["table_truncated"]}


ERROR_CASES = [
    ("encrypted", 422, "文件有密码保护，请先去掉密码再转换"),
    ("no_text", 422, "没有可提取的文字，可能是扫描件或图片，暂不支持"),
    ("conversion_failed", 422, "文件无法解析，可能已损坏"),
    ("too_complex", 422, "文件太大或太复杂，转换超时或内存不足"),
    ("unsupported_format", 415, "暂不支持这种格式"),
    ("too_large", 413, "文件超过 20 MB"),
    ("busy", 503, "转换服务繁忙，请稍后重试"),
]


@pytest.mark.parametrize(("code", "expected_status", "expected_message"), ERROR_CASES)
async def test_converter_error_mapping(
    login,
    client: AsyncClient,
    converter: FakeConverter,
    code: str,
    expected_status: int,
    expected_message: str,
) -> None:
    converter.error_code = code
    await login()
    r = await client.post("/api/convert", files=_upload())
    assert r.status_code == expected_status
    assert r.json()["detail"] == expected_message


async def test_unknown_converter_error_code_falls_back_to_503(
    login, client: AsyncClient, converter: FakeConverter
) -> None:
    """防御性兜底：converter 以后加了新错误码，也不能把内部代码原样暴露给用户。"""
    converter.error_code = "some_future_code"
    await login()
    r = await client.post("/api/convert", files=_upload())
    assert r.status_code == 503
    assert r.json()["detail"] == "转换服务暂不可用，请稍后再试"


async def test_converter_unreachable_returns_503(
    login, client: AsyncClient, converter: FakeConverter
) -> None:
    converter.unavailable = True
    await login()
    r = await client.post("/api/convert", files=_upload())
    assert r.status_code == 503
    assert r.json()["detail"] == "转换服务暂不可用，请稍后再试"


async def test_concurrency_limit(login, client: AsyncClient, converter: FakeConverter) -> None:
    await login()
    converter.gate = asyncio.Event()
    task = asyncio.create_task(client.post("/api/convert", files=_upload()))
    await asyncio.wait_for(converter.started.wait(), timeout=2)

    r2 = await client.post("/api/convert", files=_upload())
    assert r2.status_code == 429
    assert r2.json()["detail"] == "上一个文件还在转换，请稍后"

    converter.gate.set()
    r1 = await task
    assert r1.status_code == 200


async def test_global_in_flight_limit(
    login, client: AsyncClient, converter: FakeConverter, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "convert_max_in_flight", 1)
    await login("alice@example.com")
    converter.gate = asyncio.Event()
    task = asyncio.create_task(client.post("/api/convert", files=_upload()))
    await asyncio.wait_for(converter.started.wait(), timeout=2)

    # bob 自己没有在转的文件，但所有用户合计的名额已经满了
    await login("bob@example.com")
    r2 = await client.post("/api/convert", files=_upload())
    assert r2.status_code == 503
    assert r2.json()["detail"] == "转换服务繁忙，请稍后重试"

    converter.gate.set()
    assert (await task).status_code == 200
    # alice 的名额还回来之后，bob 就能转了
    assert (await client.post("/api/convert", files=_upload())).status_code == 200


async def test_inactive_users_are_dropped_from_memory(
    login, client: AsyncClient, clock: FakeClock, limiter: ConvertLimiter
) -> None:
    await login("alice@example.com")
    assert (await client.post("/api/convert", files=_upload())).status_code == 200
    clock.advance(hours=23)
    await login("bob@example.com")
    assert (await client.post("/api/convert", files=_upload())).status_code == 200
    assert len(limiter._users) == 2

    # 又过了 2 小时：alice 唯一的计数已经超过一天，被清出内存；bob 的还在窗口里
    clock.advance(hours=2)
    assert (await client.post("/api/convert", files=_upload())).status_code == 200
    assert len(limiter._users) == 1


async def test_busy_is_not_counted_against_rate_limit(
    login, client: AsyncClient, converter: FakeConverter, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "convert_hourly_limit", 1)
    await login()
    converter.error_code = "busy"
    for _ in range(5):
        r = await client.post("/api/convert", files=_upload())
        assert r.status_code == 503

    # 忙碌响应完全不计数：小时上限是 1，前面 5 次忙碌之后仍然能转一次
    converter.error_code = None
    assert (await client.post("/api/convert", files=_upload())).status_code == 200
    # 这次成功的转换才真正计数，现在应该已经到小时上限了
    r = await client.post("/api/convert", files=_upload())
    assert r.status_code == 429


async def test_hourly_limit_with_retry_after(
    login, client: AsyncClient, clock: FakeClock, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "convert_hourly_limit", 2)
    await login()
    for _ in range(2):
        assert (await client.post("/api/convert", files=_upload())).status_code == 200

    r = await client.post("/api/convert", files=_upload())
    assert r.status_code == 429
    assert r.json()["detail"] == "转换太频繁，请 61 分钟后再试"
    assert r.headers["retry-after"] == "3601"

    clock.advance(hours=1, seconds=1)
    assert (await client.post("/api/convert", files=_upload())).status_code == 200


async def test_daily_limit_with_retry_after(
    login, client: AsyncClient, clock: FakeClock, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "convert_daily_limit", 2)
    await login()
    for _ in range(2):
        assert (await client.post("/api/convert", files=_upload())).status_code == 200

    r = await client.post("/api/convert", files=_upload())
    assert r.status_code == 429
    assert r.json()["detail"] == "转换太频繁，请 1441 分钟后再试"
    assert r.headers["retry-after"] == "86401"

    clock.advance(days=1, seconds=1)
    assert (await client.post("/api/convert", files=_upload())).status_code == 200
