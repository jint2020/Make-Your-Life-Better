"""子进程隔离 runner 的测试：用 tests.slow_targets 里的可控目标函数，
不依赖真实的转换逻辑，不依赖病态文件。
"""

from __future__ import annotations

import threading

import pytest

from app import runner


def test_quick_success_roundtrip() -> None:
    out = runner.run_job(
        "tests.slow_targets",
        "return_value",
        ({"hello": "world", "nested": [1, 2, 3]},),
        timeout_seconds=5,
        max_memory_mb=500,
    )
    assert out.kind == "value"
    assert out.value == {"hello": "world", "nested": [1, 2, 3]}


def test_exception_roundtrip() -> None:
    out = runner.run_job(
        "tests.slow_targets",
        "raise_value_error",
        ("boom message",),
        timeout_seconds=5,
        max_memory_mb=500,
    )
    assert out.kind == "exception"
    assert isinstance(out.exception, ValueError)
    assert str(out.exception) == "boom message"


def test_timeout_kills_child() -> None:
    out = runner.run_job(
        "tests.slow_targets",
        "sleep_seconds",
        (10.0,),
        timeout_seconds=0.3,
        max_memory_mb=500,
    )
    assert out.kind == "killed"
    assert out.kill_reason == "timeout"


def test_memory_limit_kills_child() -> None:
    out = runner.run_job(
        "tests.slow_targets",
        "grow_memory_mb",
        (300, 5.0),
        timeout_seconds=10,
        max_memory_mb=100,
    )
    assert out.kind == "killed"
    assert out.kill_reason == "memory"


def test_crash_reports_crashed() -> None:
    out = runner.run_job(
        "tests.slow_targets",
        "crash_hard",
        (),
        timeout_seconds=5,
        max_memory_mb=500,
    )
    assert out.kind == "crashed"
    assert out.exit_code == 1


def test_child_killed_mid_send_is_crashed_not_hang() -> None:
    """子进程发结果发到一半被杀：父进程要读到 EOF、按崩溃处理，而不是永远卡在 recv 里
    （那样超时检查失效，调用方占着的转换名额也还不回去）。在线程里跑，回归时测试失败而不是卡死。
    """
    outcomes: list[runner.Outcome] = []
    worker = threading.Thread(
        target=lambda: outcomes.append(
            runner.run_job(
                "tests.slow_targets",
                "die_mid_send",
                (),
                timeout_seconds=3,
                max_memory_mb=500,
            )
        ),
        daemon=True,
    )
    worker.start()
    worker.join(timeout=15)
    assert outcomes, "run_job 卡住了：子进程死在发结果的半路，父进程没有读到 EOF"
    assert outcomes[0].kind == "crashed"


def test_large_return_value() -> None:
    # 确保管道能承载比缓冲区大得多的返回值（比如长 Markdown 文本），父子进程不会互相等死
    big = "x" * (2 * 1024 * 1024)  # 2 MB
    out = runner.run_job(
        "tests.slow_targets",
        "return_value",
        (big,),
        timeout_seconds=10,
        max_memory_mb=500,
    )
    assert out.kind == "value"
    assert out.value == big


@pytest.mark.parametrize("bad_module", ["nonexistent_module", "app.nonexistent"])
def test_unknown_module_becomes_exception(bad_module: str) -> None:
    out = runner.run_job(
        bad_module,
        "whatever",
        (),
        timeout_seconds=5,
        max_memory_mb=500,
    )
    # 子进程 import 失败会把异常发回来
    assert out.kind == "exception"
