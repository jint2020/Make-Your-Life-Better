"""加密 OOXML 文件的识别。

加了密码的 .docx / .pptx / .xlsx 不再是 ZIP：Office 把它们包进一个 OLE2/CFB 复合文档
（MS-OFFCRYPTO），里面有一个流叫 "EncryptedPackage"。magika 认不出这种文件是
docx/pptx/xlsx（它已经不是 ZIP 了），所以注册的转换器都不会接受它，如果什么都不做，
最终只会得到一个笼统的"格式不支持"。

这里不用完整实现 OLE2 复合文件格式解析：开头的 8 字节 magic 固定，目录项里的流名是
UTF-16LE 编码、以 null 结尾/填充，直接在原始字节里找这段编码后的子串就足够可靠——
不会在真正的旧版二进制 .doc/.ppt/.xls 里凑巧出现。

同样是 OLE2 但没有这个流的，就是没加密的旧版二进制格式（.doc/.ppt/.xls，哪怕改了
扩展名），我们不支持这些格式。
"""

from __future__ import annotations

from typing import Literal

OLE2_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_ENCRYPTED_PACKAGE_UTF16LE = "EncryptedPackage".encode("utf-16-le")

Ole2Verdict = Literal["encrypted", "unsupported", None]


def sniff_ole2(data: bytes) -> Ole2Verdict:
    """返回该文件是否是 OLE2 复合文档，以及是否带有加密标记。

    - None：不是 OLE2 文件（可能是 ZIP/OOXML、PDF 等，交给 markitdown 继续判断）
    - "encrypted"：OLE2 文件，且含有 EncryptedPackage 流 —— 加密的 docx/pptx/xlsx
    - "unsupported"：OLE2 文件，但没有那个流 —— 旧版二进制 .doc/.ppt/.xls 等
    """
    if not data.startswith(OLE2_MAGIC):
        return None
    if _ENCRYPTED_PACKAGE_UTF16LE in data:
        return "encrypted"
    return "unsupported"
