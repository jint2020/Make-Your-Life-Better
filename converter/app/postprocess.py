"""转换结果的统一后处理：图片占位、扫描件（无文字）检测、字体编码问题提示。

不管走哪个转换器（markitdown 自带的还是我们自己写的 xlsx/csv），最终的 Markdown
都要经过这一层，规则见 docs/design.md §三。
"""

from __future__ import annotations

import re

_EXTERNAL_PREFIXES = ("http://", "https://")

# ![alt](src)，src 允许带一个可选的 "title"；src 本身不含空白或右括号
_MD_IMAGE_RE = re.compile(r'!\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)')
# 兜底：markdownify 正常都会把 <img> 转成上面的 Markdown 语法，但个别路径可能残留原始标签
_HTML_IMG_TAG_RE = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
_HTML_ATTR_RE = re.compile(r"""(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*'([^']*)'""")

_HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
_PLACEHOLDER_RE = re.compile(r"\[图片(?:：[^\]]*)?\]")
# Markdown 的标点：标题 # 、表格 | 、列表/分隔线 - 、强调 * 、引用 > 、行内代码 `
_MARKDOWN_PUNCTUATION_RE = re.compile(r"[#|\-*>`]")

_CID_RE = re.compile(r"\(cid:\d+\)")
_UNREADABLE_GLYPHS_THRESHOLD = 10


def _placeholder(alt: str) -> str:
    alt = alt.strip()
    return f"[图片：{alt}]" if alt else "[图片]"


def _is_external(src: str) -> bool:
    return src.lower().startswith(_EXTERNAL_PREFIXES)


def _html_tag_attrs(tag: str) -> dict[str, str]:
    attrs: dict[str, str] = {}
    for m in _HTML_ATTR_RE.finditer(tag):
        if m.group(1) is not None:
            attrs[m.group(1).lower()] = m.group(2)
        else:
            attrs[m.group(3).lower()] = m.group(4)
    return attrs


def _replace_markdown_images(text: str) -> str:
    def repl(m: re.Match[str]) -> str:
        alt, src = m.group(1), m.group(2)
        if _is_external(src):
            return m.group(0)
        return _placeholder(alt)

    return _MD_IMAGE_RE.sub(repl, text)


def _replace_html_images(text: str) -> str:
    def repl(m: re.Match[str]) -> str:
        attrs = _html_tag_attrs(m.group(0))
        src = attrs.get("src", "")
        if _is_external(src):
            return m.group(0)
        return _placeholder(attrs.get("alt", ""))

    return _HTML_IMG_TAG_RE.sub(repl, text)


def replace_images(markdown: str) -> str:
    """内嵌图片、文档内部路径的图片 → 占位符；http(s) 外链保持原样。"""
    text = _replace_markdown_images(markdown)
    text = _replace_html_images(text)
    return text


def count_unreadable_glyphs(markdown: str) -> int:
    """PDF 字体编码有问题时，pdfminer 会输出 (cid:123) 这样的占位。"""
    return len(_CID_RE.findall(markdown))


def has_unreadable_glyphs(markdown: str) -> bool:
    return count_unreadable_glyphs(markdown) >= _UNREADABLE_GLYPHS_THRESHOLD


def is_empty_of_text(markdown: str) -> bool:
    """去掉 HTML 注释、图片占位符、Markdown 标点和空白后，还剩不剩东西。"""
    text = _HTML_COMMENT_RE.sub("", markdown)
    text = _PLACEHOLDER_RE.sub("", text)
    text = _MARKDOWN_PUNCTUATION_RE.sub("", text)
    text = re.sub(r"\s+", "", text)
    return text == ""
