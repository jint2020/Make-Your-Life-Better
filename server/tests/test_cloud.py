import json

import pytest
from httpx import AsyncClient

from app.auth import SESSION_COOKIE
from app.config import get_settings
from app.storage import InMemoryObjectStore

pytestmark = pytest.mark.usefixtures("db_clean")

CONFIG = {"version": 1, "fieldRows": [{"id": "r1"}]}


def upload_form(
    files: list[tuple[str, bytes]], name: str = "对比任务", config: object = CONFIG
) -> dict:
    return {
        "data": {"tool_id": "excel-compare", "name": name, "config": json.dumps(config)},
        "files": [("files", (fname, data, "text/csv")) for fname, data in files],
    }


async def test_requires_login(client: AsyncClient, db_clean: None) -> None:
    assert (await client.get("/api/cloud/tasks")).status_code == 401
    assert (await client.get("/api/cloud/usage")).status_code == 401


async def test_save_list_get_download_delete(
    login, client: AsyncClient, store: InMemoryObjectStore
) -> None:
    await login()
    r = await client.post(
        "/api/cloud/tasks", **upload_form([("名单 A.csv", b"id\n1\n"), ("b.csv", b"id\n2\n")])
    )
    assert r.status_code == 201, r.text
    task = r.json()
    assert task["config"] == CONFIG
    assert [f["name"] for f in task["files"]] == ["名单 A.csv", "b.csv"]
    assert task["total_bytes"] == 10
    assert len(store.objects) == 2

    r = await client.get("/api/cloud/tasks", params={"tool_id": "excel-compare"})
    assert [t["id"] for t in r.json()] == [task["id"]]
    assert "config" not in r.json()[0]
    assert (await client.get("/api/cloud/tasks", params={"tool_id": "other"})).json() == []

    r = await client.get(f"/api/cloud/tasks/{task['id']}")
    assert r.json()["config"] == CONFIG

    file_id = task["files"][0]["id"]
    r = await client.get(f"/api/cloud/tasks/{task['id']}/files/{file_id}")
    assert r.status_code == 200
    assert r.content == b"id\n1\n"
    assert "filename*=UTF-8''%E5%90%8D%E5%8D%95%20A.csv" in r.headers["content-disposition"]

    usage = (await client.get("/api/cloud/usage")).json()
    assert usage["used_bytes"] == 10
    assert usage["task_count"] == 1

    assert (await client.delete(f"/api/cloud/tasks/{task['id']}")).status_code == 204
    assert store.objects == {}
    assert (await client.get(f"/api/cloud/tasks/{task['id']}")).status_code == 404
    assert (await client.get("/api/cloud/usage")).json()["used_bytes"] == 0


async def test_other_users_cannot_see_tasks(login, client: AsyncClient) -> None:
    await login("alice@example.com")
    task = (await client.post("/api/cloud/tasks", **upload_form([("a.csv", b"x")]))).json()
    file_id = task["files"][0]["id"]

    client.cookies.clear()
    await login("mallory@example.com")
    assert (await client.get("/api/cloud/tasks")).json() == []
    assert (await client.get(f"/api/cloud/tasks/{task['id']}")).status_code == 404
    r = await client.get(f"/api/cloud/tasks/{task['id']}/files/{file_id}")
    assert r.status_code == 404
    assert (await client.delete(f"/api/cloud/tasks/{task['id']}")).status_code == 404


async def test_file_too_large(login, client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "max_file_bytes", 5)
    await login()
    r = await client.post("/api/cloud/tasks", **upload_form([("big.csv", b"123456")]))
    assert r.status_code == 413
    assert "big.csv" in r.json()["detail"]


async def test_quota_exceeded(login, client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "user_quota_bytes", 10)
    await login()
    assert (
        await client.post("/api/cloud/tasks", **upload_form([("a.csv", b"12345678")]))
    ).status_code == 201
    r = await client.post("/api/cloud/tasks", **upload_form([("b.csv", b"123")]))
    assert r.status_code == 409


async def test_task_count_limit(
    login, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "user_max_tasks", 1)
    await login()
    assert (
        await client.post("/api/cloud/tasks", **upload_form([("a.csv", b"1")]))
    ).status_code == 201
    assert (
        await client.post("/api/cloud/tasks", **upload_form([("a.csv", b"1")]))
    ).status_code == 409


@pytest.mark.parametrize("config", ["not json", "[1, 2]"])
async def test_invalid_config(login, client: AsyncClient, config: str) -> None:
    await login()
    form = upload_form([("a.csv", b"1")])
    form["data"]["config"] = config
    assert (await client.post("/api/cloud/tasks", **form)).status_code == 422


async def test_failed_upload_leaves_nothing(
    login, client: AsyncClient, store: InMemoryObjectStore, monkeypatch: pytest.MonkeyPatch
) -> None:
    await login()
    calls = 0
    original = store.put

    def flaky_put(key, body, content_type):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise ConnectionError("minio down")
        original(key, body, content_type)

    monkeypatch.setattr(store, "put", flaky_put)
    with pytest.raises(ConnectionError):
        await client.post("/api/cloud/tasks", **upload_form([("a.csv", b"1"), ("b.csv", b"2")]))
    assert store.objects == {}
    assert (await client.get("/api/cloud/tasks")).json() == []


async def test_delete_account_removes_everything(
    login, client: AsyncClient, store: InMemoryObjectStore, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "code_resend_seconds", 0)
    await login("gone@example.com")
    await client.post("/api/cloud/tasks", **upload_form([("a.csv", b"1")]))
    token = client.cookies[SESSION_COOKIE]
    assert (await client.delete("/api/auth/account")).status_code == 204
    assert store.objects == {}
    client.cookies.set(SESSION_COOKIE, token)
    assert (await client.get("/api/auth/me")).status_code == 401
    # 同一个邮箱可以重新注册，是一个新账号
    client.cookies.clear()
    await login("gone@example.com")
    assert (await client.get("/api/cloud/tasks")).json() == []
