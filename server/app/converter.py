"""文件转 Markdown：转换器客户端，转发给独立的 converter 服务（顶层 converter/，见设计文档第三节）。

阅后即焚：这里绝不能记录文件内容或文件名，调用方（routes/convert.py）
只应该记录大小、扩展名、耗时和结果。
"""

from functools import lru_cache
from typing import Literal, Protocol

import httpx
from pydantic import BaseModel

from .config import get_settings

ConvertWarning = Literal["table_truncated", "unreadable_glyphs"]

# converter 可能返回的错误码；具体提示文案见 routes/convert.py
ConverterErrorCode = Literal[
    "encrypted",
    "no_text",
    "conversion_failed",
    "too_complex",
    "unsupported_format",
    "too_large",
    "busy",
]


class ConvertResult(BaseModel):
    markdown: str
    warnings: list[ConvertWarning]


class ConverterError(Exception):
    """converter 返回了非 200，携带它的错误码（见 ConverterErrorCode）。"""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class ConverterUnavailable(Exception):
    """连不上 converter、超时，或者响应不是预期的格式。"""


class ConverterClient(Protocol):
    async def convert(self, ext: str, content: bytes) -> ConvertResult: ...


@lru_cache
def _http_client() -> httpx.AsyncClient:
    # 缓存成单例复用连接池；base_url 在第一次调用时读取当前配置
    return httpx.AsyncClient(base_url=get_settings().converter_url)


class HttpConverterClient:
    """真实实现：经内部网络转发给 converter（见 docker-compose.yml 的 converter 网络）。"""

    async def convert(self, ext: str, content: bytes) -> ConvertResult:
        s = get_settings()
        try:
            resp = await _http_client().post(
                "/convert",
                params={"ext": ext},
                content=content,
                timeout=s.convert_request_timeout_seconds,
            )
        except httpx.HTTPError as e:
            raise ConverterUnavailable from e

        if resp.status_code == 200:
            try:
                return ConvertResult.model_validate(resp.json())
            except Exception as e:
                raise ConverterUnavailable from e

        try:
            code = resp.json()["code"]
            if not isinstance(code, str):
                raise TypeError("code 不是字符串")
        except Exception as e:
            raise ConverterUnavailable from e
        raise ConverterError(code)


@lru_cache
def get_converter() -> ConverterClient:
    return HttpConverterClient()
