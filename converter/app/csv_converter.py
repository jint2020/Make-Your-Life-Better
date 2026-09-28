"""自写的 CSV → Markdown 转换器：编码探测 + 行数预算，不用 markitdown 自带的实现，
好和 xlsx 共用同一套截断规则（同一个 MAX_CELLS 预算、同样的提示文案、同样的
table_truncated 警告）。

以 DocumentConverter 子类的形式注册到同一个 MarkItDown 实例。
"""

from __future__ import annotations

import csv
import io
from typing import Any, BinaryIO

from charset_normalizer import from_bytes
from markitdown import DocumentConverter, DocumentConverterResult, StreamInfo

ACCEPTED_MIME_TYPE_PREFIXES = ["text/csv", "application/csv"]
ACCEPTED_FILE_EXTENSIONS = [".csv"]


def decode_csv_bytes(data: bytes) -> str:
    """先按严格 UTF-8 解码（顺带去掉 BOM），失败就用 charset-normalizer 猜，
    再失败就用 gb18030 硬解码（用替换字符兜底，不会再失败）。"""
    try:
        return data.decode("utf-8-sig", errors="strict")
    except UnicodeDecodeError:
        pass

    best = from_bytes(data).best()
    if best is not None:
        try:
            return str(best)
        except Exception:
            pass

    return data.decode("gb18030", errors="replace")


def _escape_cell_text(text: str) -> str:
    text = text.replace("|", "\\|")
    return text.replace("\r\n", "<br>").replace("\n", "<br>").replace("\r", "<br>")


def _trim_outer_blank_rows(rows: list[list[str]]) -> None:
    """去掉开头、结尾，以及表头之后紧跟着的空行（原地修改）。"""
    start = 0
    while start < len(rows) and not rows[start]:
        start += 1

    if start == len(rows):
        rows.clear()
        return

    header_index = start
    start += 1
    while start < len(rows) and not rows[start]:
        start += 1

    end = len(rows)
    while end > start and not rows[end - 1]:
        end -= 1

    del rows[end:]
    del rows[header_index + 1 : start]
    del rows[:header_index]


def render_table(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    num_columns = max(len(r) for r in rows)
    lines = []
    header = rows[0] + [""] * (num_columns - len(rows[0]))
    lines.append("| " + " | ".join(_escape_cell_text(c) for c in header) + " |")
    lines.append("|" + "|".join(["---"] * num_columns) + "|")
    for row in rows[1:]:
        padded = row + [""] * (num_columns - len(row))
        lines.append("| " + " | ".join(_escape_cell_text(c) for c in padded) + " |")
    return "\n".join(lines)


class CsvConverter(DocumentConverter):
    """把 CSV 转成 Markdown 表格：没有标题（和 markitdown 自带的 CSV 输出一致）。"""

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

        content = decode_csv_bytes(file_stream.read())

        rows = list(csv.reader(io.StringIO(content, newline="")))
        _trim_outer_blank_rows(rows)

        if not rows:
            return DocumentConverterResult(markdown="")

        num_columns = max(len(r) for r in rows)
        row_budget = max(1, max_cells // max(1, num_columns))

        header, data_rows = rows[0], rows[1:]
        truncated = len(data_rows) > row_budget - 1
        kept_data_rows = data_rows[: row_budget - 1] if truncated else data_rows

        sections: list[str] = []
        if truncated:
            warnings.append("table_truncated")
            sections.append(
                f"> 此文件共 {len(data_rows)} 行，只保留了前 {len(kept_data_rows)} 行。"
            )

        sections.append(render_table([header, *kept_data_rows]))

        return DocumentConverterResult(markdown="\n\n".join(sections).strip())
