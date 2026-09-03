import ExcelJS from 'exceljs'
import { canSeePII } from '@/shared/domain/rules/exportRules'
import type { Role } from '@/shared/domain/types'

export interface ExportColumn<T> {
  key: string
  header: string
  width?: number
  type?: 'text' | 'number' | 'date' | 'percent'
  /** X01 — cột chứa dữ liệu cá nhân, sẽ bị che nếu vai trò không đủ quyền */
  pii?: boolean
  value: (row: T) => string | number | Date | null
}

export interface ExportOptions<T> {
  /** X04 — ASCII slug, không dấu, không khoảng trắng */
  fileSlug: string
  sheetName: string
  title: string
  columns: ExportColumn<T>[]
  rows: T[]
  /** X03 — snapshot bộ lọc, ghi vào sheet "Thông tin" */
  meta: Record<string, string>
  actor: { role: Role; name: string }
}

/** X01 — che phần giữa: 0987654321 → 098****321 */
export function maskPii(value: unknown): string {
  const s = String(value ?? '')
  if (s.includes('@')) {
    const [user, domain] = s.split('@')
    return `${user.slice(0, 2)}***@${domain}`
  }
  if (s.length <= 6) return '***'
  return `${s.slice(0, 3)}${'*'.repeat(Math.max(3, s.length - 6))}${s.slice(-3)}`
}

const HEADER_FILL = 'FFE8EEF7'
/**
 * Font Unicode. Tuyệt đối KHÔNG dùng font bảng mã cũ (.VnTime, VNI-Times) —
 * đó là nguyên nhân kinh điển của "lỗi font tiếng Việt".
 */
const FONT = 'Calibri'

export async function buildWorkbook<T>(opts: ExportOptions<T>): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = opts.actor.name
  wb.created = new Date()

  const masked = !canSeePII(opts.actor.role)
  const ws = wb.addWorksheet(opts.sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  })

  ws.columns = opts.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 18,
  }))

  const head = ws.getRow(1)
  head.font = { name: FONT, size: 11, bold: true }
  head.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  head.height = 26
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF9AA8BD' } } }
  })

  for (const row of opts.rows) {
    const values: Record<string, unknown> = {}
    for (const c of opts.columns) {
      const raw = c.value(row)
      values[c.key] = c.pii && masked ? maskPii(raw) : raw
    }
    const r = ws.addRow(values)
    r.font = { name: FONT, size: 11 }
    r.alignment = { vertical: 'middle' }
  }

  // X06 — gán đúng kiểu dữ liệu, không để số/ngày rơi về text
  opts.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1)
    if (c.pii && masked) return
    if (c.type === 'date') col.numFmt = 'dd/mm/yyyy'
    else if (c.type === 'number') col.numFmt = '#,##0'
    else if (c.type === 'percent') col.numFmt = '0.0%'
  })

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: opts.columns.length } }

  // X03 — sheet thông tin: người xuất, thời điểm, bộ lọc đã áp dụng
  const info = wb.addWorksheet('Thông tin')
  info.columns = [{ width: 26 }, { width: 62 }]
  const meta: Array<[string, string]> = [
    ['Báo cáo', opts.title],
    ['Người xuất', `${opts.actor.name} (${opts.actor.role})`],
    ['Thời điểm xuất', new Date().toLocaleString('vi-VN')],
    ['Số dòng', String(opts.rows.length)],
    ['Dữ liệu cá nhân', masked ? 'Đã che theo phân quyền' : 'Hiển thị đầy đủ'],
    ...Object.entries(opts.meta),
  ]
  for (const [k, v] of meta) {
    const row = info.addRow([k, v])
    row.getCell(1).font = { name: FONT, bold: true, size: 11 }
    row.getCell(2).font = { name: FONT, size: 11 }
  }

  return wb
}

/** X04 — bỏ dấu tiếng Việt để tên file an toàn trên mọi hệ điều hành */
export function asciiSlug(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

export async function exportXlsx<T>(opts: ExportOptions<T>): Promise<void> {
  const wb = await buildWorkbook(opts)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${asciiSlug(opts.fileSlug)}_${stamp()}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
