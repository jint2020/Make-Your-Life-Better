"""/convert 的错误码和对应的 HTTP 状态码。

契约：出错时响应体固定是 `{"code": str}`，不套在 FastAPI 默认的 `{"detail": ...}` 里，
所以用自定义异常 + 异常处理器（见 main.py），而不是 HTTPException。
"""

from __future__ import annotations

STATUS_BY_CODE: dict[str, int] = {
    "too_large": 413,
    "unsupported_format": 415,
    "encrypted": 422,
    "no_text": 422,
    "conversion_failed": 422,
    "too_complex": 422,
    "busy": 503,
}


class ApiError(Exception):
    """携带错误码的 API 异常，由 main.py 里的异常处理器转成 `{"code": ...}` 响应。"""

    def __init__(self, code: str) -> None:
        if code not in STATUS_BY_CODE:
            raise ValueError(f"未知的错误码：{code}")
        self.code = code
        self.status_code = STATUS_BY_CODE[code]
        super().__init__(code)
