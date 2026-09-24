import pytest

from app.config import Settings


def test_empty_env_vars_fall_back_to_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    # compose 里 ${SMTP_USERNAME:-} 没填时传进来的是空字符串，不能当成用户名去做 SMTP 认证
    monkeypatch.setenv("SMTP_USERNAME", "")
    monkeypatch.setenv("SMTP_PORT", "")
    s = Settings(_env_file=None)
    assert s.smtp_username is None
    assert s.smtp_port == 1025
