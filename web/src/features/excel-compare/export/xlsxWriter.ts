import { Zip, ZipDeflate } from 'fflate'

import { columnLetter } from '../parse/headers'

/**
 * 最小的 xlsx 生成器：只支持导出用到的功能（几种固定样式、合并单元格、冻结窗格、自动筛选、列宽）。
 *
 * 为什么不用 ExcelJS：实测 10 万行 × 59 列要 198 秒、3.6 GB 内存，浏览器会崩。
 * 这里用共享字符串表（重复的值只存一次）+ fflate 流式压缩（不在内存里拼整份 XML），
 * 同样规模约 2.4 秒、几十 MB。
 */

/** 单元格样式，对应 styles.xml 里 cellXfs 的下标 */
export const XLSX_STYLE = {
  normal: 0,
  header: 1,
  diff: 2,
  missing: 3,
  groupHeader: 4,
} as const
export type XlsxStyle = (typeof XLSX_STYLE)[keyof typeof XLSX_STYLE]

/** 单元格：纯文本，或者带样式的文本；null 表示空单元格（不写） */
export type XlsxCell = string | { v: string; s: XlsxStyle } | null

export interface XlsxSheet {
  name: string
  /** 列宽（字符数） */
  widths: number[]
  /** 冻结前几行、前几列 */
  freeze?: { rows: number; cols: number }
  /** 在第几行（从 1 开始）的所有列上加自动筛选 */
  autoFilterRow?: number
  /** 合并区域，如 "A1:C1" */
  merges?: string[]
  /** 逐行产出单元格。用回调而不是数组，10 万行时不用先在内存里攒一份 */
  rows: (emit: (cells: XlsxCell[]) => void) => void
}

/** Excel 单元格最多 32767 个字符 */
const MAX_CELL_CHARS = 32767
/** XML 1.0 不允许的控制字符 */
// oxlint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g
/** 攒够这么多字符再压缩一次，兼顾速度和内存 */
const FLUSH_CHARS = 1 << 20

function escapeXml(s: string): string {
  return s
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 工作表名：不能含 []:*?/\，最多 31 个字符，不能重名 */
function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet'
  let candidate = base
  for (let k = 2; used.has(candidate); k++) candidate = `${base.slice(0, 28)}(${k})`
  used.add(candidate)
  return candidate
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const STYLES_XML =
  XML_HEAD +
  `<styleSheet xmlns="${NS_MAIN}">` +
  '<fonts count="4">' +
  '<font><sz val="11"/><name val="等线"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="等线"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FF92400E"/><name val="等线"/><family val="2"/></font>' +
  '<font><sz val="11"/><color rgb="FF9CA3AF"/><name val="等线"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="5">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF4F4F5"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="5">' +
  // 0 normal
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  // 1 header
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
  // 2 diff
  '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  // 3 missing
  '<xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  // 4 group header
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

/** 生成 xlsx 文件字节 */
export function writeXlsx(sheets: XlsxSheet[]): Uint8Array {
  const chunks: Uint8Array[] = []
  const zip = new Zip((err, data) => {
    if (err) throw err
    chunks.push(data)
  })
  const encoder = new TextEncoder()
  const addFile = (path: string, content: string) => {
    const file = new ZipDeflate(path, { level: 6 })
    zip.add(file)
    file.push(encoder.encode(content), true)
  }

  const strings = new Map<string, number>()
  const stringIndex = (s: string) => {
    let i = strings.get(s)
    if (i === undefined) {
      i = strings.size
      strings.set(s, i)
    }
    return i
  }

  const usedNames = new Set<string>()
  const sheetMeta: { name: string; filterRef: string | null }[] = []

  sheets.forEach((sheet, idx) => {
    const name = safeSheetName(sheet.name, usedNames)
    const letters = sheet.widths.map((_, c) => columnLetter(c))
    const lastCol = letters[letters.length - 1] ?? 'A'

    const file = new ZipDeflate(`xl/worksheets/sheet${idx + 1}.xml`, { level: 1 })
    zip.add(file)

    let head = `${XML_HEAD}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">`
    const fr = sheet.freeze?.rows ?? 0
    const fc = sheet.freeze?.cols ?? 0
    if (fr > 0 || fc > 0) {
      const topLeft = `${columnLetter(fc)}${fr + 1}`
      const pane = fr > 0 && fc > 0 ? 'bottomRight' : fr > 0 ? 'bottomLeft' : 'topRight'
      head +=
        '<sheetViews><sheetView workbookViewId="0"' +
        (idx === 0 ? ' tabSelected="1"' : '') +
        '><pane' +
        (fc > 0 ? ` xSplit="${fc}"` : '') +
        (fr > 0 ? ` ySplit="${fr}"` : '') +
        ` topLeftCell="${topLeft}" activePane="${pane}" state="frozen"/>` +
        `<selection pane="${pane}" activeCell="${topLeft}" sqref="${topLeft}"/></sheetView></sheetViews>`
    }
    head += '<sheetFormatPr defaultRowHeight="15"/>'
    if (sheet.widths.length > 0) {
      head +=
        '<cols>' +
        sheet.widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('') +
        '</cols>'
    }
    head += '<sheetData>'

    let buf = head
    let rowNo = 0
    const flush = (final: boolean) => {
      file.push(encoder.encode(buf), final)
      buf = ''
    }
    sheet.rows((cells) => {
      rowNo++
      buf += `<row r="${rowNo}">`
      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c]
        if (cell == null) continue
        const text = typeof cell === 'string' ? cell : cell.v
        const style = typeof cell === 'string' ? 0 : cell.s
        const ref = `${letters[c] ?? columnLetter(c)}${rowNo}`
        const s = style ? ` s="${style}"` : ''
        if (text === '') {
          // 空文本但有样式（比如表头合并区域里的空格子）：只写样式
          if (style) buf += `<c r="${ref}"${s}/>`
          continue
        }
        buf += `<c r="${ref}"${s} t="s"><v>${stringIndex(text.slice(0, MAX_CELL_CHARS))}</v></c>`
      }
      buf += '</row>'
      if (buf.length > FLUSH_CHARS) flush(false)
    })
    buf += '</sheetData>'

    let filterRef: string | null = null
    if (sheet.autoFilterRow && rowNo >= sheet.autoFilterRow) {
      filterRef = `A${sheet.autoFilterRow}:${lastCol}${rowNo}`
      buf += `<autoFilter ref="${filterRef}"/>`
    }
    if (sheet.merges && sheet.merges.length > 0) {
      buf += `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    }
    buf += '</worksheet>'
    flush(true)
    sheetMeta.push({ name, filterRef })
  })

  // 共享字符串表
  const sst = new ZipDeflate('xl/sharedStrings.xml', { level: 1 })
  zip.add(sst)
  let sbuf = `${XML_HEAD}<sst xmlns="${NS_MAIN}" count="${strings.size}" uniqueCount="${strings.size}">`
  for (const s of strings.keys()) {
    const preserve = /^\s|\s$/.test(s) ? ' xml:space="preserve"' : ''
    sbuf += `<si><t${preserve}>${escapeXml(s)}</t></si>`
    if (sbuf.length > FLUSH_CHARS) {
      sst.push(encoder.encode(sbuf))
      sbuf = ''
    }
  }
  sst.push(encoder.encode(sbuf + '</sst>'), true)

  addFile('xl/styles.xml', STYLES_XML)

  const quote = (name: string) => `'${name.replace(/'/g, "''")}'`
  const definedNames = sheetMeta
    .map((m, i) => {
      if (!m.filterRef) return ''
      const [from, to] = m.filterRef.split(':')
      const abs = (ref: string) => ref.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2')
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escapeXml(
        `${quote(m.name)}!${abs(from!)}:${abs(to!)}`,
      )}</definedName>`
    })
    .join('')
  addFile(
    'xl/workbook.xml',
    `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView/></bookViews><sheets>` +
      sheetMeta.map((m, i) => `<sheet name="${escapeXml(m.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets>' +
      (definedNames ? `<definedNames>${definedNames}</definedNames>` : '') +
      '</workbook>',
  )
  addFile(
    'xl/_rels/workbook.xml.rels',
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheetMeta
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('') +
      `<Relationship Id="rId${sheetMeta.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId${sheetMeta.length + 2}" Type="${NS_REL}/sharedStrings" Target="sharedStrings.xml"/>` +
      '</Relationships>',
  )
  addFile(
    '_rels/.rels',
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
      '</Relationships>',
  )
  addFile(
    '[Content_Types].xml',
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheetMeta
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      '</Types>',
  )
  zip.end()

  const total = chunks.reduce((n, c) => n + c.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}
