"""文件转 Markdown 的并发和频率限制：都放在进程内存里，重启清零（见 docs/design.md 第三节）。

现在是单进程部署，够用；以后改成多进程再迁到数据库或 Redis。
时钟做成可以注入的依赖，测试才能不真的等一小时 / 一天。
"""

import uuid
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from functools import lru_cache

from fastapi import HTTPException, status

from .config import get_settings

Clock = Callable[[], datetime]

# 清理不活跃用户的间隔：计数一天后才全部过期，没必要每个请求都扫一遍
SWEEP_INTERVAL = timedelta(hours=1)


def utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass
class _UserState:
    in_flight: bool = False
    # 只有真正转发给 converter、且结果不是"忙碌"或"连不上"才记一条时间戳
    requests: list[datetime] = field(default_factory=list)


class ConvertLimiter:
    """每个用户同时只能转 1 个文件，所有用户合计同时最多转发 N 个；
    每小时 / 每天各有一个滚动窗口的次数上限。"""

    def __init__(self, clock: Clock = utcnow) -> None:
        self._clock = clock
        self._users: dict[uuid.UUID, _UserState] = defaultdict(_UserState)
        self._in_flight = 0
        self._last_sweep = clock()

    def acquire(self, user_id: uuid.UUID) -> None:
        """转发前调用：并发和频率都在这里检查，通过就立即占住并发名额。

        失败时不会占用名额，调用方不需要（也不应该）在失败时调用 release。
        成功后调用方必须保证之后调用 release，通常用 try/finally。
        """
        now = self._clock()
        self._sweep(now)

        state = self._users[user_id]
        if state.in_flight:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "上一个文件还在转换，请稍后")

        s = get_settings()
        state.requests = [t for t in state.requests if now - t < timedelta(days=1)]
        self._check_window(state.requests, now, timedelta(hours=1), s.convert_hourly_limit)
        self._check_window(state.requests, now, timedelta(days=1), s.convert_daily_limit)

        # 全局上限：每个在途请求在内存里占着最多 20 MB 的文件内容，而 converter 同时只转 2 个，
        # 多出来的请求只是在那边排队。和 converter 忙碌一样提示，也一样不计入频率限制
        if self._in_flight >= s.convert_max_in_flight:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "转换服务繁忙，请稍后重试")

        state.in_flight = True
        self._in_flight += 1

    @staticmethod
    def _check_window(
        requests: list[datetime], now: datetime, window: timedelta, limit: int
    ) -> None:
        in_window = [t for t in requests if now - t < window]
        if len(in_window) < limit:
            return
        oldest = min(in_window)
        retry_after = int((oldest + window - now).total_seconds()) + 1
        minutes = max(1, (retry_after + 59) // 60)
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"转换太频繁，请 {minutes} 分钟后再试",
            headers={"Retry-After": str(retry_after)},
        )

    def _sweep(self, now: datetime) -> None:
        """每小时最多一次：把没在转换、一天内也没有计数的用户清出内存，免得只增不减。"""
        if now - self._last_sweep < SWEEP_INTERVAL:
            return
        self._last_sweep = now
        for user_id, state in list(self._users.items()):
            state.requests = [t for t in state.requests if now - t < timedelta(days=1)]
            if not state.in_flight and not state.requests:
                del self._users[user_id]

    def record(self, user_id: uuid.UUID) -> None:
        """请求已经转发给 converter，且结果不是忙碌 / 连不上，计入频率限制。"""
        self._users[user_id].requests.append(self._clock())

    def release(self, user_id: uuid.UUID) -> None:
        """请求处理结束（不管成功与否），释放并发名额。"""
        state = self._users[user_id]
        if state.in_flight:
            state.in_flight = False
            self._in_flight -= 1


@lru_cache
def get_limiter() -> ConvertLimiter:
    return ConvertLimiter()
