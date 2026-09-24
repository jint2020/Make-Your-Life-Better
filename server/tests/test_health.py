import pytest
from httpx import AsyncClient

from app import db, storage


async def test_health(client: AsyncClient) -> None:
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


async def test_ready_ok(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def ok_db() -> None:
        return None

    monkeypatch.setattr(db, "check_db", ok_db)
    monkeypatch.setattr(storage, "check_storage", lambda: None)
    r = await client.get("/api/health/ready")
    assert r.status_code == 200
    assert r.json() == {"database": True, "storage": True}


async def test_ready_reports_failed_dependency(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def broken_db() -> None:
        raise ConnectionError("down")

    monkeypatch.setattr(db, "check_db", broken_db)
    monkeypatch.setattr(storage, "check_storage", lambda: None)
    r = await client.get("/api/health/ready")
    assert r.status_code == 503
    assert r.json() == {"database": False, "storage": True}


async def test_openapi_under_api_prefix(client: AsyncClient) -> None:
    r = await client.get("/api/openapi.json")
    assert r.status_code == 200
    assert "/api/health" in r.json()["paths"]
