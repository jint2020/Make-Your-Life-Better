from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

MB = 1024 * 1024


class Settings(BaseSettings):
    """全部配置来自环境变量（本机开发可以放在 server/.env）。"""

    # env_ignore_empty：compose 里没填的变量会以空字符串传进来，当作没设置
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    app_version: str = "dev"

    database_url: str = "postgresql+asyncpg://mylb:mylb@localhost:5432/mylb"

    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "mylb"
    s3_secret_key: str = "mylb-dev-secret"
    s3_bucket: str = "mylb"
    s3_region: str = "us-east-1"

    # 会话 cookie。本机 http://localhost 也能用 Secure cookie，所以默认开着
    cookie_secure: bool = True
    session_ttl_days: int = 30

    # 邮箱验证码
    code_ttl_minutes: int = 10
    code_resend_seconds: int = 60
    code_daily_limit: int = 10
    code_max_attempts: int = 5

    # 密码连续输错后临时锁定
    password_max_failures: int = 5
    password_lock_minutes: int = 15

    # 发信：生产填通用 SMTP；开发默认发到 Mailpit
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_security: Literal["none", "starttls", "ssl"] = "none"
    smtp_from: str = "Make Your Life Better <no-reply@localhost>"

    # 云端额度
    user_quota_bytes: int = 500 * MB
    user_max_tasks: int = 50
    max_file_bytes: int = 50 * MB
    max_files_per_task: int = 10
    max_config_bytes: int = 1 * MB


@lru_cache
def get_settings() -> Settings:
    return Settings()
