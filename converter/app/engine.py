"""转换引擎：组装 MarkItDown、跑一次转换、把各种异常归类成固定的错误码。

**只在子进程里调用 `build_markitdown()` / `convert_document()`**：MarkItDown() 的构造函数
会创建一个 `magika.Magika()`，它会启动 onnxruntime 的线程池。forkserver 预加载这个模块只是
为了让子进程里 `import markitdown` 等重依赖不用每次冷启动，但绝不能在预加载阶段（也就是
模块顶层）就构造 MarkItDown/Magika ——那样问一次 fork 出来的子进程会直接从父进程"继承"
一个已经起了线程的运行时，存在死锁风险。构造必须发生在 fork 之后，也就是 runner.py 真正
调用 convert_document() 的时候。
"""

from __future__ import annotations

import io
from typing import Any

from markitdown import (
    FileConversionException,
    MarkItDown,
    MissingDependencyException,
    StreamInfo,
    UnsupportedFormatException,
)
from markitdown.converters import (
    DocxConverter,
    EpubConverter,
    HtmlConverter,
    PdfConverter,
    PptxConverter,
)
from pdfminer.pdfdocument import PDFEncryptionError

from . import postprocess
from .csv_converter import CsvConverter
from .ole2 import sniff_ole2
from .xlsx_converter import XlsxConverter


class ConversionError(Exception):
    """转换失败的基类；子类一一对应 /convert 契约里的错误码。"""


class EncryptedError(ConversionError):
    """文件加了密码，或者是加密的 OOXML（OLE2 里套着 EncryptedPackage 流）。"""


class NoTextError(ConversionError):
    """转完之后没有可提取的文字（可能是扫描件、或者只有图片/占位）。"""


class UnsupportedFormatError(ConversionError):
    """内容嗅探之后发现不是我们支持的格式（例如旧版二进制 .doc/.ppt/.xls，哪怕改了扩展名）。"""


class ConversionFailedError(ConversionError):
    """文件损坏、解析不出来，或者其他没有归类的转换失败。"""


def build_markitdown() -> MarkItDown:
    """只注册白名单里的转换器：不要 ZIP、图片、音频、纯文本、RSS、URL 这些。"""
    mdit = MarkItDown(enable_builtins=False, enable_plugins=False)
    mdit.register_converter(PdfConverter())
    mdit.register_converter(DocxConverter())
    mdit.register_converter(PptxConverter())
    mdit.register_converter(HtmlConverter())
    mdit.register_converter(EpubConverter())
    mdit.register_converter(XlsxConverter())
    mdit.register_converter(CsvConverter())
    return mdit


def _pdf_was_encrypted(exc: FileConversionException) -> bool:
    for attempt in exc.attempts or []:
        if attempt.exc_info is not None and isinstance(attempt.exc_info[1], PDFEncryptionError):
            return True
    return False


def convert_document(data: bytes, ext: str, max_cells: int) -> dict[str, Any]:
    """把文件字节转换成 Markdown。跑在独立子进程里（见 runner.py）。

    返回 `{"markdown": str, "warnings": list[str]}`；失败时抛出上面某个 ConversionError 子类。
    """
    ole2_verdict = sniff_ole2(data)
    if ole2_verdict == "encrypted":
        raise EncryptedError("OLE2 复合文档里含有 EncryptedPackage 流，是加密的 Office 文件")
    if ole2_verdict == "unsupported":
        raise UnsupportedFormatError("OLE2 复合文档（旧版二进制 .doc/.ppt/.xls）不受支持")

    mdit = build_markitdown()
    warnings_sideband: list[str] = []
    try:
        result = mdit.convert_stream(
            io.BytesIO(data),
            stream_info=StreamInfo(extension=ext),
            max_cells=max_cells,
            warnings=warnings_sideband,
        )
    except UnsupportedFormatException as e:
        raise UnsupportedFormatError(str(e)) from e
    except FileConversionException as e:
        if _pdf_was_encrypted(e):
            raise EncryptedError("PDF 加密或需要密码") from e
        raise ConversionFailedError(str(e)) from e
    except MissingDependencyException as e:
        raise ConversionFailedError(str(e)) from e

    markdown = postprocess.replace_images(result.markdown)

    warnings: list[str] = []
    if "table_truncated" in warnings_sideband:
        warnings.append("table_truncated")
    if postprocess.has_unreadable_glyphs(markdown):
        warnings.append("unreadable_glyphs")

    if postprocess.is_empty_of_text(markdown):
        raise NoTextError("没有可提取的文字，可能是扫描件")

    return {"markdown": markdown, "warnings": warnings}
