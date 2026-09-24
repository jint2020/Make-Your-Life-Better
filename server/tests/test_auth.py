import pytest
from httpx import AsyncClient

from app.auth import SESSION_COOKIE
from app.config import get_settings

from .conftest import FakeMailer

pytestmark = pytest.mark.usefixtures("db_clean")


@pytest.fixture
def no_resend_wait(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "code_resend_seconds", 0)


async def test_code_login_registers_new_user(client: AsyncClient, mailer: FakeMailer) -> None:
    r = await client.post("/api/auth/code", json={"email": " Alice@Example.com "})
    assert r.status_code == 204
    assert mailer.sent[0][0] == "alice@example.com"

    r = await client.post(
        "/api/auth/login/code",
        json={"email": "ALICE@example.com", "code": mailer.last_code("alice@example.com")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "alice@example.com"
    assert body["has_password"] is False
    assert SESSION_COOKIE in client.cookies

    r = await client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["id"] == body["id"]


async def test_me_requires_login(client: AsyncClient) -> None:
    r = await client.get("/api/auth/me")
    assert r.status_code == 401


async def test_code_is_single_use(client: AsyncClient, mailer: FakeMailer) -> None:
    await client.post("/api/auth/code", json={"email": "a@example.com"})
    code = mailer.last_code("a@example.com")
    r = await client.post("/api/auth/login/code", json={"email": "a@example.com", "code": code})
    assert r.status_code == 200
    r = await client.post("/api/auth/login/code", json={"email": "a@example.com", "code": code})
    assert r.status_code == 400


async def test_wrong_code_attempts_are_limited(client: AsyncClient, mailer: FakeMailer) -> None:
    await client.post("/api/auth/code", json={"email": "a@example.com"})
    code = mailer.last_code("a@example.com")
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(get_settings().code_max_attempts):
        r = await client.post(
            "/api/auth/login/code", json={"email": "a@example.com", "code": wrong}
        )
        assert r.status_code == 400
    # 试满次数后，正确的验证码也不能用了
    r = await client.post("/api/auth/login/code", json={"email": "a@example.com", "code": code})
    assert r.status_code == 400


async def test_only_latest_code_counts(
    client: AsyncClient, mailer: FakeMailer, no_resend_wait: None
) -> None:
    await client.post("/api/auth/code", json={"email": "a@example.com"})
    old = mailer.last_code("a@example.com")
    await client.post("/api/auth/code", json={"email": "a@example.com"})
    new = mailer.last_code("a@example.com")
    if old != new:
        r = await client.post("/api/auth/login/code", json={"email": "a@example.com", "code": old})
        assert r.status_code == 400
    r = await client.post("/api/auth/login/code", json={"email": "a@example.com", "code": new})
    assert r.status_code == 200


async def test_resend_too_soon(client: AsyncClient) -> None:
    r = await client.post("/api/auth/code", json={"email": "a@example.com"})
    assert r.status_code == 204
    r = await client.post("/api/auth/code", json={"email": "a@example.com"})
    assert r.status_code == 429


async def test_daily_limit(client: AsyncClient, no_resend_wait: None) -> None:
    for _ in range(get_settings().code_daily_limit):
        r = await client.post("/api/auth/code", json={"email": "a@example.com"})
        assert r.status_code == 204
    r = await client.post("/api/auth/code", json={"email": "a@example.com"})
    assert r.status_code == 429


async def test_mail_failure_returns_503_and_allows_retry(
    client: AsyncClient, mailer: FakeMailer
) -> None:
    mailer.fail = True
    r = await client.post("/api/auth/code", json={"email": "a@example.com"})
    assert r.status_code == 503
    # 发送失败的那次不算，立刻可以重试
    mailer.fail = False
    r = await client.post("/api/auth/code", json={"email": "a@example.com"})
    assert r.status_code == 204


async def test_invalid_email_rejected(client: AsyncClient) -> None:
    r = await client.post("/api/auth/code", json={"email": "not-an-email"})
    assert r.status_code == 422


async def test_password_login_after_setting_password(login, client: AsyncClient) -> None:
    await login("bob@example.com")
    r = await client.put("/api/auth/password", json={"password": "correct horse"})
    assert r.status_code == 204
    assert (await client.get("/api/auth/me")).json()["has_password"] is True

    await client.post("/api/auth/logout")
    assert (await client.get("/api/auth/me")).status_code == 401

    r = await client.post(
        "/api/auth/login/password", json={"email": "BOB@example.com", "password": "wrong"}
    )
    assert r.status_code == 401
    r = await client.post(
        "/api/auth/login/password",
        json={"email": "bob@example.com", "password": "correct horse"},
    )
    assert r.status_code == 200
    assert (await client.get("/api/auth/me")).status_code == 200


async def test_password_login_unknown_or_passwordless(login, client: AsyncClient) -> None:
    await login("nopass@example.com")
    for email in ["nopass@example.com", "ghost@example.com"]:
        r = await client.post(
            "/api/auth/login/password", json={"email": email, "password": "whatever1"}
        )
        assert r.status_code == 401
        assert r.json()["detail"] == "邮箱或密码不正确"


async def test_password_lockout_and_code_login_unlocks(
    login, client: AsyncClient, mailer: FakeMailer, no_resend_wait: None
) -> None:
    await login("carol@example.com")
    await client.put("/api/auth/password", json={"password": "right password"})
    await client.post("/api/auth/logout")

    for _ in range(get_settings().password_max_failures):
        r = await client.post(
            "/api/auth/login/password", json={"email": "carol@example.com", "password": "nope"}
        )
        assert r.status_code == 401
    r = await client.post(
        "/api/auth/login/password",
        json={"email": "carol@example.com", "password": "right password"},
    )
    assert r.status_code == 429

    # 验证码登录会解除锁定
    await login("carol@example.com")
    await client.post("/api/auth/logout")
    r = await client.post(
        "/api/auth/login/password",
        json={"email": "carol@example.com", "password": "right password"},
    )
    assert r.status_code == 200


async def test_short_password_rejected(login, client: AsyncClient) -> None:
    await login()
    r = await client.put("/api/auth/password", json={"password": "short"})
    assert r.status_code == 422


async def test_logout_invalidates_session(login, client: AsyncClient) -> None:
    await login()
    token = client.cookies[SESSION_COOKIE]
    await client.post("/api/auth/logout")
    client.cookies.set(SESSION_COOKIE, token)
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_set_password_logs_out_other_sessions(
    login, client: AsyncClient, no_resend_wait: None
) -> None:
    await login("dave@example.com")
    other = client.cookies[SESSION_COOKIE]
    client.cookies.clear()
    await login("dave@example.com")
    await client.put("/api/auth/password", json={"password": "new password"})
    assert (await client.get("/api/auth/me")).status_code == 200
    client.cookies.set(SESSION_COOKIE, other)
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_session_cookie_attributes(login, client: AsyncClient, mailer: FakeMailer) -> None:
    await client.post("/api/auth/code", json={"email": "e@example.com"})
    r = await client.post(
        "/api/auth/login/code",
        json={"email": "e@example.com", "code": mailer.last_code("e@example.com")},
    )
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "path=/api" in cookie
