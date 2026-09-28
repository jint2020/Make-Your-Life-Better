"""给 `app.runner.run_job` 用的测试专用目标函数。

runner 的超时 / 超内存 / 崩溃这几条路径，用真实文件很难稳定触发（尤其是内存），
所以 runner 设计成"目标是一个模块路径 + 函数名"，测试可以指向这里的函数，
不需要构造病态文件。这些函数必须是模块顶层的（可以被 pickle 按引用找到），
不能是闭包/lambda。
"""

from __future__ import annotations

import time


def sleep_seconds(seconds: float) -> str:
    time.sleep(seconds)
    return "done"


def raise_value_error(message: str) -> None:
    raise ValueError(message)


def grow_memory_mb(target_mb: int, hold_seconds: float) -> str:
    """分配大约 target_mb 兆字节并保持一段时间，用来触发内存超限杀进程。"""
    chunk = bytearray(target_mb * 1024 * 1024)
    # 确保页面真的被触碰（写入），不然操作系统可能不会真正分配物理内存
    for i in range(0, len(chunk), 4096):
        chunk[i] = 1
    time.sleep(hold_seconds)
    return f"grew {len(chunk)}"


def return_value(value: object) -> object:
    return value


def crash_hard() -> None:
    """模拟子进程崩溃：直接终止进程，不走正常的返回路径，也不会发回任何结果。"""
    import os

    os._exit(1)


def die_mid_send() -> None:
    """模拟子进程发结果发到一半被杀（比如被内核 OOM killer 杀掉）：只写出一条 10 MB 消息的
    长度头和开头一小段，然后 SIGKILL 自己。

    管道连接不在参数里，从调用方 runner._child_main 的局部变量 conn 拿。
    """
    import os
    import signal
    import struct
    import sys

    conn = sys._getframe(1).f_locals["conn"]
    os.write(conn.fileno(), struct.pack("!i", 10_000_000) + b"x" * 1000)
    os.kill(os.getpid(), signal.SIGKILL)
