from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

MB = 1024 * 1024


class Settings(BaseSettings):
    """全部配置来自环境变量，前缀 CONVERTER_（本机开发可以放在 converter/.env）。"""

    # env_ignore_empty：compose 里没填的变量会以空字符串传进来，当作没设置
    model_config = SettingsConfigDict(
        env_prefix="CONVERTER_", env_file=".env", extra="ignore", env_ignore_empty=True
    )

    app_version: str = "dev"

    # 单个文件大小上限
    max_file_bytes: int = 20 * MB

    # 同时最多转几个文件；排队超过这个时间就报"服务繁忙"
    concurrency: int = 2
    queue_timeout_seconds: float = 30.0

    # 单个转换超过这个时间，或者子进程内存（RSS）超过这个上限，就杀掉子进程
    timeout_seconds: float = 60.0
    max_memory_mb: float = 900.0

    # xlsx / csv 每个文件最多保留的单元格数（跨工作表共享一个预算）
    max_cells: int = 50_000


@lru_cache
def get_settings() -> Settings:
    return Settings()
