"""自写的 XLSX → Markdown 转换器。

markitdown 自带的 XlsxConverter 把整张工作簿读进 pandas：实测 5 万行 × 20 列要 20 秒、
1.8 GB 内存。这里改成 openpyxl 只读模式逐行流式读取，MAX_CELLS 是整个文件（不是单个
工作表）的预算，内存只随保留下来的行数增长，不随文件大小增长。

以 DocumentConverter 子类的形式注册到同一个 MarkItDown 实例，这样 magika 的内容嗅探、
markitdown 内置的收尾处理（去掉行尾空白、折叠多余空行）都能直接复用。
"""

from __future__ import annotations

import datetime
from typing import Any, BinaryIO

import openpyxl
from markitdown import DocumentConverter, DocumentConverterResult, StreamInfo

ACCEPTED_MIME_TYPE_PREFIXES = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]
ACCEPTED_FILE_EXTENSIONS = [".xlsx"]

Row = tuple[Any, ...]


def _escape_cell_text(text: str) -> str:
    text = text.replace("|", "\\|")
    return text.replace("\r\n", "<br>").replace("\n", "<br>").replace("\r", "<br>")


def _format_number(value: int | float) -> str:
    if isinstance(value, int):
        return str(value)
    if value != value or value in (float("inf"), float("-inf")):  # NaN / Infinity
        return ""
    if value.is_integer() and abs(value) < 1e16:
        return str(int(value))
    # repr() 是 Python 里最短的、能还原原值的表示，不会有 0.1+0.2 那种浮点噪声
    return repr(value)


def _format_datetime(value: datetime.date | datetime.time) -> str:
    if isinstance(value, datetime.datetime):
        if value.time() == datetime.time(0, 0, 0):
            return value.strftime("%Y-%m-%d")
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, datetime.date):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, datetime.time):
        return value.strftime("%H:%M:%S")
    return str(value)


def format_cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        text = "TRUE" if value else "FALSE"
    elif isinstance(value, (int, float)):
        text = _format_number(value)
    elif isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        text = _format_datetime(value)
    else:
        text = str(value)
    return _escape_cell_text(text)


def _trim_trailing_empty_rows(rows: list[Row]) -> list[Row]:
    end = len(rows)
    while end > 0 and all(c is None for c in rows[end - 1]):
        end -= 1
    return rows[:end]


def _trim_trailing_empty_columns(rows: list[Row]) -> list[Row]:
    if not rows:
        return rows
    last_non_empty = -1
    for row in rows:
        for i in range(len(row) - 1, last_non_empty, -1):
            if row[i] is not None:
                last_non_empty = i
                break
    if last_non_empty < 0:
        return [() for _ in rows]
    return [row[: last_non_empty + 1] for row in rows]


def render_table(rows: list[Row]) -> str:
    """rows[0] 是表头。"""
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    header, *data = rows
    header = list(header) + [None] * (width - len(header))

    lines = ["| " + " | ".join(format_cell(c) for c in header) + " |"]
    lines.append("|" + "|".join(["---"] * width) + "|")
    for row in data:
        padded = list(row) + [None] * (width - len(row))
        lines.append("| " + " | ".join(format_cell(c) for c in padded) + " |")
    return "\n".join(lines)


class _SheetRead:
    def __init__(
        self, kept: list[Row], truncated: bool, row_budget: int, true_total_rows: int | None
    ) -> None:
        self.kept = kept
        self.truncated = truncated
        self.row_budget = row_budget
        # 截断后实际数出来的总行数（含表头）；表比窥探范围还长、数不到表尾时为 None
        self.true_total_rows = true_total_rows


# 截断成立后继续往下数的行数上限：数到表尾就能报准确的"共 M 行"，数不到就用"原表更长"。
# 工作表的 <dimension> 声明经常被整列套格式撑大，不能直接拿来当总数。
_PEEK_ROWS = 1000


def _read_sheet(ws: Any, remaining_budget: int) -> _SheetRead:
    """流式读一个工作表，最多读到能装进 remaining_budget 个单元格为止。

    注意两点：

    1. openpyxl 只读模式默认按工作表 XML 里 <dimension> 声明的行数停止读取；有些写工具
       这个声明是错的（比实际行数小），会静默漏掉真实数据。这里显式传 max_row 绕开它。
    2. 截断判定必须真的看到第 row_budget + 1 行才成立，所以迭代上限必须比"最多可能的
       行数"（单列时正好等于 remaining_budget）多；再加上 _PEEK_ROWS 用于数出真实总数。
    """
    kept: list[Row] = []
    width_hint: int | None = None
    row_budget = 1
    truncated = False
    peeked = 0
    reached_end = False

    for row in ws.iter_rows(values_only=True, max_row=remaining_budget + 1 + _PEEK_ROWS):
        if width_hint is None:
            width_hint = max(1, len(row))
            row_budget = max(1, remaining_budget // width_hint)
        if len(kept) <= row_budget:
            kept.append(row)
            if len(kept) > row_budget:
                truncated = True
            continue
        peeked += 1
        if peeked >= _PEEK_ROWS:
            break
    else:
        reached_end = True

    if truncated:
        kept = kept[:row_budget]

    # 迭代自然结束（没撞上窥探上限）说明看到了表尾，总数就是实际数出来的行数
    true_total_rows = row_budget + 1 + peeked if (truncated and reached_end) else None
    return _SheetRead(kept, truncated, row_budget, true_total_rows)


class XlsxConverter(DocumentConverter):
    """把 XLSX 转成 Markdown：每个工作表一个 `## 表名` 标题 + GFM 表格。"""

    def accepts(self, file_stream: BinaryIO, stream_info: StreamInfo, **kwargs: Any) -> bool:
        mimetype = (stream_info.mimetype or "").lower()
        extension = (stream_info.extension or "").lower()
        if extension in ACCEPTED_FILE_EXTENSIONS:
            return True
        return any(mimetype.startswith(p) for p in ACCEPTED_MIME_TYPE_PREFIXES)

    def convert(
        self, file_stream: BinaryIO, stream_info: StreamInfo, **kwargs: Any
    ) -> DocumentConverterResult:
        max_cells: int = kwargs.get("max_cells", 50_000)
        warnings: list[str] = kwargs.get("warnings", [])

        wb = openpyxl.load_workbook(file_stream, read_only=True, data_only=True)
        try:
            remaining = max_cells
            sections: list[str] = []
            for name in wb.sheetnames:
                ws = wb[name]
                sections.append(f"## {name}")

                if remaining <= 0:
                    sections.append("> 单元格预算已用完，此工作表已跳过。")
                    continue

                sheet_read = _read_sheet(ws, remaining)
                kept = sheet_read.kept

                if not kept:
                    sections.append("*（空工作表）*")
                    continue

                charge_rows = len(kept)
                charge_cols = max(len(r) for r in kept)
                remaining -= charge_rows * charge_cols

                if sheet_read.truncated:
                    warnings.append("table_truncated")
                    kept_data_rows = len(kept) - 1
                    if sheet_read.true_total_rows is not None:
                        total_data_rows = sheet_read.true_total_rows - 1
                        sections.append(
                            f"> 此工作表共 {total_data_rows} 行，只保留了前 {kept_data_rows} 行。"
                        )
                    else:
                        sections.append(f"> 此工作表只保留了前 {kept_data_rows} 行（原表更长）。")

                kept = _trim_trailing_empty_rows(kept)
                kept = _trim_trailing_empty_columns(kept)
                sections.append(render_table(kept))

            markdown = "\n\n".join(sections).strip()
        finally:
            wb.close()

        return DocumentConverterResult(markdown=markdown)
