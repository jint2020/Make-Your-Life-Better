"""子进程隔离：每次转换单独起一个进程，超时/超内存/崩溃都杀掉。

用 "forkserver" 而不是默认的 "fork" 或 "spawn"：
- "spawn" 每次都要重新执行一遍 Python 解释器再重新 import，markitdown + onnxruntime 这些重
  依赖每次冷启动实测要 13 秒左右。
- "forkserver" 只在第一次用的时候启动一个专门的辅助进程，预先 import 好 app.engine（见
  `set_forkserver_preload`），之后每次转换只是从这个辅助进程 fork，走写时复制，秒开。
- 但 forkserver 的辅助进程必须保持单线程：如果预加载阶段就构造了 MarkItDown()（连带启动
  magika/onnxruntime 的线程池），之后每次 fork 出来的子进程都会"继承"一个已经有多个线程的
  父进程状态——fork 只会复制发起调用的那一个线程，其他线程持有的锁永远不会被释放，子进程
  很容易死锁。所以 app.engine 在模块顶层只做 import，真正构造 MarkItDown() 留到子进程里
  （fork 完成之后）才做，见 engine.build_markitdown() 的调用位置。

结果经一条单向管道传回来，而不是 multiprocessing.Queue：父进程启动子进程后马上关掉自己
手里的写端，子进程一死（哪怕结果只写了一半）读端就能读到 EOF。Queue 做不到这一点，因为
父进程自己一直握着它的写端。

这里的 run_job() 本身和转换逻辑无关：target 是一个"模块路径 + 函数名"，测试可以指向
tests 目录下的慢函数/吃内存函数，不需要真的构造一个病态文件也能测超时和内存杀。
"""

from __future__ import annotations

import contextlib
import dataclasses
import importlib
import multiprocessing as mp
import pickle
import time
from multiprocessing.connection import Connection
from multiprocessing.context import BaseContext
from typing import Any, Literal

import psutil

_PRELOAD_MODULES = ["app.engine"]

_ctx: BaseContext | None = None


def get_context() -> BaseContext:
    """懒加载：第一次调用时才配置并启动 forkserver 辅助进程。"""
    global _ctx
    if _ctx is None:
        ctx = mp.get_context("forkserver")
        ctx.set_forkserver_preload(_PRELOAD_MODULES)
        _ctx = ctx
    return _ctx


def _set_oom_score_adj_best_effort() -> None:
    """让内核在需要杀进程的时候优先杀这个转换子进程，而不是 API 主进程。仅 Linux 有效，
    失败（比如本机开发用的 macOS）不影响转换，纯粹 best-effort。"""
    try:
        with open("/proc/self/oom_score_adj", "w") as f:
            f.write("1000")
    except OSError:
        pass


def _child_main(
    conn: Connection, target_module: str, target_func: str, args: tuple[Any, ...]
) -> None:
    _set_oom_score_adj_best_effort()
    try:
        module = importlib.import_module(target_module)
        func = getattr(module, target_func)
        value = func(*args)
        try:
            conn.send(("value", value))
        except Exception:
            # 返回值本身序列化失败（正常情况下不会发生），至少把这个失败报回去
            conn.send(("exception", RuntimeError("结果无法序列化")))
    except BaseException as e:
        try:
            conn.send(("exception", e))
        except Exception:
            # 异常对象本身序列化失败，退化成一个纯文本的 RuntimeError
            conn.send(("exception", RuntimeError(f"{type(e).__name__}: {e}")))


Kind = Literal["value", "exception", "killed", "crashed"]


@dataclasses.dataclass
class Outcome:
    kind: Kind
    value: Any = None
    exception: BaseException | None = None
    kill_reason: Literal["timeout", "memory"] | None = None
    exit_code: int | None = None


def _rss_mb(pid: int) -> float | None:
    try:
        return psutil.Process(pid).memory_info().rss / (1024 * 1024)
    except psutil.NoSuchProcess:
        return None


def _kill(process: Any) -> None:
    with contextlib.suppress(Exception):
        process.kill()  # POSIX 上就是 SIGKILL


def _crashed(process: Any) -> Outcome:
    # 管道读到 EOF 的时候子进程可能还没被回收，等一下才拿得到退出码
    process.join(timeout=1)
    return Outcome(kind="crashed", exit_code=process.exitcode)


def _receive(reader: Connection, process: Any) -> Outcome:
    """读子进程发回来的那一条消息。

    子进程没发就退出了，读到 EOFError；发到一半被杀（比如被内核 OOM killer 杀掉），读到
    OSError("got end of file during message")。两种都当成崩溃（映射成 too_complex）。
    """
    try:
        data = reader.recv_bytes()
    except (EOFError, OSError):
        return _crashed(process)
    try:
        kind, payload = pickle.loads(data)
    except Exception:
        # 子进程那边能序列化、这边却还原不出来（比如构造参数对不上的异常类）
        return Outcome(kind="exception", exception=RuntimeError("子进程的结果无法解析"))
    if kind == "value":
        return Outcome(kind="value", value=payload)
    return Outcome(kind="exception", exception=payload)


def run_job(
    target_module: str,
    target_func: str,
    args: tuple[Any, ...],
    *,
    timeout_seconds: float,
    max_memory_mb: float,
    poll_interval: float = 0.2,
) -> Outcome:
    """在独立子进程里跑 `target_module.target_func(*args)`，返回结果或失败原因。

    完全同步、阻塞（轮询 + sleep）：调用方要放到线程池里跑（例如 run_in_threadpool），
    不要在 asyncio 事件循环里直接调用。
    """
    ctx = get_context()
    reader, writer = ctx.Pipe(duplex=False)
    process = ctx.Process(target=_child_main, args=(writer, target_module, target_func, args))

    start = time.monotonic()
    process.start()
    # 管道只有在所有写端都关掉之后才读得到 EOF。父进程自己留着这份写端的话，子进程发结果
    # 发到一半死掉，父进程会永远卡在 recv 里等剩下的字节：超时和内存检查都不再执行，
    # 调用方占着的转换名额也永远还不回去
    writer.close()

    try:
        outcome: Outcome | None = None
        while outcome is None:
            # 有数据可读，或者子进程已经退出（读端读到 EOF），poll 都会返回 True
            if reader.poll(poll_interval):
                outcome = _receive(reader, process)
                break

            if not process.is_alive():
                # 兜底：子进程已经退出，却没读到 EOF（比如写端被它派生的进程继承了）。
                # 它退出前发出的数据一定已经在管道里了，最后再看一眼
                outcome = _receive(reader, process) if reader.poll(0) else _crashed(process)
                break

            elapsed = time.monotonic() - start
            if elapsed > timeout_seconds:
                _kill(process)
                outcome = Outcome(kind="killed", kill_reason="timeout")
                break

            rss = _rss_mb(process.pid)
            if rss is not None and rss > max_memory_mb:
                _kill(process)
                outcome = Outcome(kind="killed", kill_reason="memory")
                break

        return outcome
    finally:
        if process.is_alive():
            _kill(process)
        process.join(timeout=5)
        reader.close()
