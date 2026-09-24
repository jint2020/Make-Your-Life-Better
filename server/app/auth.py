"""会话：cookie 里放随机 token，数据库里只存它的哈希。"""

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import get_session
from .models import User, UserSession
from .security import new_session_token, sha256_hex

SESSION_COOKIE = "mylb_session"
# cookie 只在调用接口时带上，静态资源请求不带
COOKIE_PATH = "/api"

DbSession = Annotated[AsyncSession, Depends(get_session)]


def utcnow() -> datetime:
    return datetime.now(UTC)


async def start_session(db: AsyncSession, response: Response, user: User) -> None:
    s = get_settings()
    token = new_session_token()
    expires_at = utcnow() + timedelta(days=s.session_ttl_days)
    db.add(UserSession(token_hash=sha256_hex(token), user_id=user.id, expires_at=expires_at))
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=s.session_ttl_days * 24 * 3600,
        path=COOKIE_PATH,
        httponly=True,
        secure=s.cookie_secure,
        samesite="lax",
    )


def clear_session_cookie(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(
        SESSION_COOKIE, path=COOKIE_PATH, httponly=True, secure=s.cookie_secure, samesite="lax"
    )


async def current_session(
    db: DbSession,
    token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> UserSession:
    if token:
        session = await db.scalar(
            select(UserSession).where(
                UserSession.token_hash == sha256_hex(token),
                UserSession.expires_at > utcnow(),
            )
        )
        if session:
            return session
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "请先登录")


async def current_user(session: Annotated[UserSession, Depends(current_session)]) -> User:
    return session.user


CurrentUser = Annotated[User, Depends(current_user)]
CurrentSession = Annotated[UserSession, Depends(current_session)]
