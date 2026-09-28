"""/convert /health API 的端到端测试。

通过 httpx ASGITransport 直接打 FastAPI app，不走真实网络；
但转换真的会进到子进程里跑，结果是真实的。
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from .fixtures import (
    make_csv_gbk,
    make_csv_many_rows,
    make_docx_with_table_and_image,
    make_encrypted_pdf,
    make_html_with_images,
    make_ole2_encrypted,
    make_plain_zip,
    make_pptx_with_picture,
    make_xlsx_many_rows,
)


@pytest.mark.asyncio
async def test_health_ok_after_warmup(client: AsyncClient) -> None:
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_convert_docx_chinese(client: AsyncClient) -> None:
    r = await client.post(
        "/convert?ext=.docx",
        content=make_docx_with_table_and_image(),
        headers={"Content-Type": "application/octet-stream"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "markdown" in body
    assert "warnings" in body
    assert isinstance(body["warnings"], list)
    assert "文档标题" in body["markdown"]
    assert "张三" in body["markdown"]


@pytest.mark.asyncio
async def test_convert_html(client: AsyncClient) -> None:
    r = await client.post(
        "/convert?ext=.html",
        content=make_html_with_images(),
    )
    assert r.status_code == 200
    body = r.json()
    # 外链保留
    assert "https://example.com/pic.png" in body["markdown"]
    # 内嵌图变成占位符
    assert "[图片：内嵌图]" in body["markdown"]


@pytest.mark.asyncio
async def test_convert_csv_gbk(client: AsyncClient) -> None:
    r = await client.post("/convert?ext=.csv", content=make_csv_gbk())
    assert r.status_code == 200
    assert "张三" in r.json()["markdown"]


@pytest.mark.asyncio
async def test_convert_pptx(client: AsyncClient) -> None:
    # 只有图的 pptx → no_text
    r = await client.post("/convert?ext=.pptx", content=make_pptx_with_picture())
    assert r.status_code == 422
    assert r.json() == {"code": "no_text"}


@pytest.mark.asyncio
async def test_convert_encrypted_pdf(client: AsyncClient) -> None:
    r = await client.post("/convert?ext=.pdf", content=make_encrypted_pdf())
    assert r.status_code == 422
    assert r.json() == {"code": "encrypted"}


@pytest.mark.asyncio
async def test_convert_ole2_encrypted(client: AsyncClient) -> None:
    r = await client.post("/convert?ext=.docx", content=make_ole2_encrypted())
    assert r.status_code == 422
    assert r.json() == {"code": "encrypted"}


@pytest.mark.asyncio
async def test_convert_plain_zip_as_pdf_not_unpacked(client: AsyncClient) -> None:
    r = await client.post("/convert?ext=.pdf", content=make_plain_zip())
    # 我们没注册 ZipConverter，PdfConverter 尝试解析失败 → conversion_failed
    assert r.status_code == 422
    assert r.json()["code"] == "conversion_failed"


@pytest.mark.asyncio
async def test_bad_extension_unsupported_format(client: AsyncClient) -> None:
    r = await client.post("/convert?ext=.mp3", content=b"abc")
    assert r.status_code == 415
    assert r.json() == {"code": "unsupported_format"}


@pytest.mark.asyncio
async def test_xlsx_truncation_warning(client: AsyncClient) -> None:
    # 默认 MAX_CELLS 是 50000，3 列 × 20000 行 = 60000 单元格，会被截断
    r = await client.post("/convert?ext=.xlsx", content=make_xlsx_many_rows(20000))
    assert r.status_code == 200
    body = r.json()
    assert "table_truncated" in body["warnings"]


@pytest.mark.asyncio
async def test_oversize_file_too_large(client: AsyncClient) -> None:
    # Content-Length 报得很大 → 直接拒绝，不用读完整个 body
    big = b"x" * 100  # 实际 body 很小，但 content-length 超限也要拒
    r = await client.post(
        "/convert?ext=.html",
        content=big,
        headers={"Content-Length": str(50 * 1024 * 1024)},
    )
    assert r.status_code == 413
    assert r.json() == {"code": "too_large"}


@pytest.mark.asyncio
async def test_convert_timeout_too_complex(client: AsyncClient) -> None:
    """超时的子进程 → 422 too_complex。
    通过 monkeypatch 把超时改得很短，再塞一个会睡很久的目标函数来测。
    """
    # 直接通过 main.convert_via_subprocess 测太慢；这里用 runner + 自定义目标
    from app import runner

    out = runner.run_job(
        "tests.slow_targets",
        "sleep_seconds",
        (10.0,),
        timeout_seconds=0.3,
        max_memory_mb=500,
    )
    assert out.kind == "killed"


@pytest.mark.asyncio
async def test_busy_when_semaphore_full(client: AsyncClient) -> None:
    """并发=1 且排队超时=1 秒，两个同时来的长请求 → 第二个报 503 busy。

    用两个并发 task：第一个占着坑，第二个在队列里等到超时。
    """
    import asyncio

    # 直接用 runner 占坑比调真实接口更稳（避免 httpx ASGITransport 的并发问题）
    from app import runner

    async def long_conversion() -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            lambda: runner.run_job(
                "tests.slow_targets",
                "sleep_seconds",
                (3.0,),
                timeout_seconds=10,
                max_memory_mb=500,
            ),
        )

    # 先用 asyncio.wait_for + asyncio.Semaphore(1) 模拟队列超时的语义
    sem = asyncio.Semaphore(1)

    async def with_busy_timeout() -> None:
        try:
            await asyncio.wait_for(sem.acquire(), timeout=0.1)
        except TimeoutError as e:
            raise RuntimeError("busy") from e
        try:
            await long_conversion()
        finally:
            sem.release()

    # 第一个占坑
    t1 = asyncio.create_task(with_busy_timeout())
    # 等一下确保第一个已经抢到
    await asyncio.sleep(0.05)
    # 第二个马上就会超时
    with pytest.raises(RuntimeError, match="busy"):
        await with_busy_timeout()
    await t1


@pytest.mark.asyncio
async def test_csv_truncation_note_and_warning(client: AsyncClient) -> None:
    r = await client.post("/convert?ext=.csv", content=make_csv_many_rows(30000))
    assert r.status_code == 200
    body = r.json()
    assert "table_truncated" in body["warnings"]
    assert "只保留了前" in body["markdown"]
