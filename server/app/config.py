from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """全部配置来自环境变量（本机开发可以放在 server/.env）。"""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_version: str = "dev"

    database_url: str = "postgresql+asyncpg://mylb:mylb@localhost:5432/mylb"

    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "mylb"
    s3_secret_key: str = "mylb-dev-secret"
    s3_bucket: str = "mylb"
    s3_region: str = "us-east-1"


@lru_cache
def get_settings() -> Settings:
    return Settings()
