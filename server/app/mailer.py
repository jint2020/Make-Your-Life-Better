from email.message import EmailMessage
from functools import lru_cache
from typing import Protocol

import aiosmtplib

from .config import get_settings


class Mailer(Protocol):
    async def send_login_code(self, to: str, code: str) -> None: ...


class SmtpMailer:
    async def send_login_code(self, to: str, code: str) -> None:
        s = get_settings()
        msg = EmailMessage()
        msg["From"] = s.smtp_from
        msg["To"] = to
        msg["Subject"] = f"登录验证码：{code}"
        msg.set_content(
            f"你的验证码是 {code}，{s.code_ttl_minutes} 分钟内有效。\n\n"
            "如果不是你本人操作，忽略这封邮件即可。\n\n— Make Your Life Better"
        )
        await aiosmtplib.send(
            msg,
            hostname=s.smtp_host,
            port=s.smtp_port,
            username=s.smtp_username,
            password=s.smtp_password,
            use_tls=s.smtp_security == "ssl",
            start_tls=s.smtp_security == "starttls",
            timeout=15,
        )


@lru_cache
def get_mailer() -> Mailer:
    return SmtpMailer()
