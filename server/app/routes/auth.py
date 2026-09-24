import logging
import uuid
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select

from ..auth import (
    CurrentSession,
    CurrentUser,
    DbSession,
    clear_session_cookie,
    start_session,
    utcnow,
)
from ..config import get_settings
from ..mailer import Mailer, get_mailer
from ..models import CloudFile, CloudTask, EmailCode, User, UserSession
from ..security import (
    hash_login_code,
    hash_password,
    needs_rehash,
    new_login_code,
    normalize_email,
    verify_password,
)
from ..storage import ObjectStore, get_object_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

INVALID_CODE = "验证码不正确或已过期，请重新获取"
INVALID_PASSWORD = "邮箱或密码不正确"


class Me(BaseModel):
    id: uuid.UUID
    email: str
    has_password: bool
    created_at: datetime


def to_me(user: User) -> Me:
    return Me(
        id=user.id,
        email=user.email,
        has_password=user.password_hash is not None,
        created_at=user.created_at,
    )


class SendCodeRequest(BaseModel):
    email: EmailStr


class CodeLoginRequest(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")


class PasswordLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class SetPasswordRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)


@router.post(
    "/code",
    operation_id="sendLoginCode",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={429: {"description": "发送太频繁"}, 503: {"description": "邮件发送失败"}},
)
async def send_code(
    body: SendCodeRequest,
    db: DbSession,
    mailer: Annotated[Mailer, Depends(get_mailer)],
) -> None:
    """发送登录验证码。邮箱还没注册时，用验证码登录就会自动注册。"""
    s = get_settings()
    email = normalize_email(body.email)
    now = utcnow()

    last = await db.scalar(select(func.max(EmailCode.created_at)).where(EmailCode.email == email))
    if last and now - last < timedelta(seconds=s.code_resend_seconds):
        wait = s.code_resend_seconds - int((now - last).total_seconds())
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"发送太频繁，请 {wait} 秒后再试")
    sent_today = await db.scalar(
        select(func.count())
        .select_from(EmailCode)
        .where(EmailCode.email == email, EmailCode.created_at > now - timedelta(days=1))
    )
    if (sent_today or 0) >= s.code_daily_limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "今天发送验证码的次数太多了，请明天再试"
        )

    code = new_login_code()
    db.add(
        EmailCode(
            email=email,
            code_hash=hash_login_code(email, code),
            created_at=now,
            expires_at=now + timedelta(minutes=s.code_ttl_minutes),
        )
    )
    try:
        await mailer.send_login_code(email, code)
    except Exception as e:
        logger.exception("验证码邮件发送失败")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "邮件发送失败，请稍后再试") from e
    await db.commit()


@router.post(
    "/login/code",
    operation_id="loginWithCode",
    responses={400: {"description": "验证码错误或过期"}},
)
async def login_with_code(body: CodeLoginRequest, db: DbSession, response: Response) -> Me:
    s = get_settings()
    email = normalize_email(body.email)
    now = utcnow()

    # 只认最近一次发送的验证码
    row = await db.scalar(
        select(EmailCode)
        .where(EmailCode.email == email)
        .order_by(EmailCode.created_at.desc())
        .limit(1)
        .with_for_update()
    )
    if (
        row is None
        or row.consumed_at is not None
        or row.expires_at <= now
        or row.attempts >= s.code_max_attempts
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, INVALID_CODE)
    if row.code_hash != hash_login_code(email, body.code):
        row.attempts += 1
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, INVALID_CODE)
    row.consumed_at = now

    user = await db.scalar(select(User).where(User.email == email).with_for_update())
    if user is None:
        user = User(email=email)
        db.add(user)
        await db.flush()
    else:
        # 验证码能证明邮箱属于本人，顺便解除密码锁定
        user.failed_password_attempts = 0
        user.locked_until = None

    await start_session(db, response, user)
    await db.commit()
    await db.refresh(user)
    return to_me(user)


@router.post(
    "/login/password",
    operation_id="loginWithPassword",
    responses={401: {"description": "邮箱或密码不正确"}, 429: {"description": "暂时锁定"}},
)
async def login_with_password(body: PasswordLoginRequest, db: DbSession, response: Response) -> Me:
    s = get_settings()
    email = normalize_email(body.email)
    now = utcnow()

    user = await db.scalar(select(User).where(User.email == email).with_for_update())
    if user and user.locked_until and user.locked_until > now:
        minutes = max(1, int((user.locked_until - now).total_seconds() // 60) + 1)
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"密码错误次数太多，请 {minutes} 分钟后再试，或者用验证码登录",
        )

    ok = await run_in_threadpool(
        verify_password, user.password_hash if user else None, body.password
    )
    if not ok or user is None:
        if user is not None and user.password_hash is not None:
            user.failed_password_attempts += 1
            if user.failed_password_attempts >= s.password_max_failures:
                user.locked_until = now + timedelta(minutes=s.password_lock_minutes)
                user.failed_password_attempts = 0
            await db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_PASSWORD)

    user.failed_password_attempts = 0
    user.locked_until = None
    assert user.password_hash is not None
    if needs_rehash(user.password_hash):
        user.password_hash = await run_in_threadpool(hash_password, body.password)
    await start_session(db, response, user)
    await db.commit()
    return to_me(user)


@router.post("/logout", operation_id="logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(session: CurrentSession, db: DbSession, response: Response) -> None:
    await db.delete(session)
    await db.commit()
    clear_session_cookie(response)


@router.get("/me", operation_id="getMe", responses={401: {"description": "未登录"}})
async def me(user: CurrentUser) -> Me:
    return to_me(user)


@router.put("/password", operation_id="setPassword", status_code=status.HTTP_204_NO_CONTENT)
async def set_password(body: SetPasswordRequest, session: CurrentSession, db: DbSession) -> None:
    """设置或修改密码（已经登录就能改；忘记密码时先用验证码登录）。其他设备会被登出。"""
    user = session.user
    user.password_hash = await run_in_threadpool(hash_password, body.password)
    user.failed_password_attempts = 0
    user.locked_until = None
    await db.execute(
        delete(UserSession).where(
            UserSession.user_id == user.id, UserSession.token_hash != session.token_hash
        )
    )
    await db.commit()


@router.delete("/account", operation_id="deleteAccount", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    user: CurrentUser,
    db: DbSession,
    response: Response,
    store: Annotated[ObjectStore, Depends(get_object_store)],
) -> None:
    """删除账号，连同所有云端文件。"""
    keys = list(
        await db.scalars(
            select(CloudFile.object_key)
            .join(CloudTask, CloudFile.task_id == CloudTask.id)
            .where(CloudTask.user_id == user.id)
        )
    )
    await run_in_threadpool(store.delete_many, keys)
    await db.delete(user)
    await db.commit()
    clear_session_cookie(response)
