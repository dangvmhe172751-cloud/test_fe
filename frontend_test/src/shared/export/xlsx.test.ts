import AdmZip from 'adm-zip'
import { describe, expect, it } from 'vitest'
import { asciiSlug, buildWorkbook, maskPii } from './xlsx'
import type { ExportColumn } from './xlsx'

interface Row {
  name: string
  phone: string
  score: number
  date: Date
}

const columns: ExportColumn<Row>[] = [
  { key: 'name', header: 'Họ và tên học viên', value: (r) => r.name },
  { key: 'phone', header: 'SĐT phụ huynh', pii: true, value: (r) => r.phone },
  { key: 'score', header: 'Điểm trung bình', type: 'number', value: (r) => r.score },
  { key: 'date', header: 'Ngày nhập học', type: 'date', value: (r) => r.date },
]

const rows: Row[] = [
  { name: 'Nguyễn Thị Hồng Nhung', phone: '0987654321', score: 8.5, date: new Date('2026-03-02') },
  { name: 'Đặng Vũ Quỳnh Anh', phone: '0912345678', score: 9, date: new Date('2026-04-15') },
]

/** Đọc lại nội dung XML bên trong file .xlsx để kiểm tra thật, không chỉ tin là đúng */
async function xmlOf(buffer: ArrayBuffer, entry: string): Promise<string> {
  const zip = new AdmZip(Buffer.from(buffer))
  return zip.getEntry(entry)?.getData().toString('utf8') ?? ''
}

describe('xuất Excel tiếng Việt', () => {
  it('chuỗi tiếng Việt có dấu được lưu nguyên vẹn trong sharedStrings.xml', async () => {
    const wb = await buildWorkbook({
      fileSlug: 'test',
      sheetName: 'Học viên',
      title: 'Danh sách học viên',
      columns,
      rows,
      meta: { 'Bộ lọc': 'Trạng thái: Đang học' },
      actor: { role: 'admin', name: 'Quản trị hệ thống' },
    })
    const buffer = await wb.xlsx.writeBuffer()
    const shared = await xmlOf(buffer as ArrayBuffer, 'xl/sharedStrings.xml')

    expect(shared).toContain('Họ và tên học viên')
    expect(shared).toContain('Nguyễn Thị Hồng Nhung')
    expect(shared).toContain('Đặng Vũ Quỳnh Anh')
    expect(shared).toContain('SĐT phụ huynh')
    // không được xuất hiện dạng mojibake của UTF-8 bị đọc bằng codepage 1252
    expect(shared).not.toContain('Ã¡')
    expect(shared).not.toContain('á»')
  })

  it('khai báo encoding UTF-8 trong XML', async () => {
    const wb = await buildWorkbook({
      fileSlug: 'test', sheetName: 'S', title: 'T', columns, rows,
      meta: {}, actor: { role: 'admin', name: 'Admin' },
    })
    const buffer = await wb.xlsx.writeBuffer()
    const shared = await xmlOf(buffer as ArrayBuffer, 'xl/sharedStrings.xml')
    expect(shared.slice(0, 60).toUpperCase()).toContain('UTF-8')
  })

  it('X01 — vai trò không đủ quyền thì cột PII bị che', async () => {
    const wb = await buildWorkbook({
      fileSlug: 'test', sheetName: 'S', title: 'T', columns, rows,
      meta: {}, actor: { role: 'teacher', name: 'GV' },
    })
    const buffer = await wb.xlsx.writeBuffer()
    const shared = await xmlOf(buffer as ArrayBuffer, 'xl/sharedStrings.xml')
    expect(shared).not.toContain('0987654321')
    expect(shared).toContain('098')
  })

  it('X01 — vai trò học vụ thấy đầy đủ', async () => {
    const wb = await buildWorkbook({
      fileSlug: 'test', sheetName: 'S', title: 'T', columns, rows,
      meta: {}, actor: { role: 'academic', name: 'Học vụ' },
    })
    const buffer = await wb.xlsx.writeBuffer()
    const shared = await xmlOf(buffer as ArrayBuffer, 'xl/sharedStrings.xml')
    expect(shared).toContain('0987654321')
  })

  it('X06 — cột số và ngày giữ đúng kiểu, không thành text', async () => {
    const wb = await buildWorkbook({
      fileSlug: 'test', sheetName: 'S', title: 'T', columns, rows,
      meta: {}, actor: { role: 'admin', name: 'Admin' },
    })
    const ws = wb.getWorksheet('S')!
    expect(typeof ws.getRow(2).getCell(3).value).toBe('number')
    expect(ws.getRow(2).getCell(4).value).toBeInstanceOf(Date)
  })

  it('X03 — có sheet "Thông tin" ghi lại người xuất và bộ lọc', async () => {
    const wb = await buildWorkbook({
      fileSlug: 'test', sheetName: 'S', title: 'Danh sách học viên', columns, rows,
      meta: { 'Bộ lọc': 'Lớp ENG-A1.01' }, actor: { role: 'admin', name: 'Quản trị hệ thống' },
    })
    const info = wb.getWorksheet('Thông tin')!
    const cells: string[] = []
    info.eachRow((row) => row.eachCell((c) => cells.push(String(c.value))))
    expect(cells).toContain('Quản trị hệ thống (admin)')
    expect(cells).toContain('Lớp ENG-A1.01')
  })
})

describe('X04 — tên file ASCII', () => {
  it('bỏ dấu tiếng Việt và ký tự đặc biệt', () => {
    expect(asciiSlug('Danh sách học viên')).toBe('danh-sach-hoc-vien')
    expect(asciiSlug('Thời khóa biểu tuần 12/2026')).toBe('thoi-khoa-bieu-tuan-12-2026')
    expect(asciiSlug('Đăng ký & hàng chờ')).toBe('dang-ky-hang-cho')
  })
})

describe('maskPii', () => {
  it('che số điện thoại giữ đầu và cuối', () => {
    expect(maskPii('0987654321')).toBe('098****321')
  })
  it('che email giữ domain', () => {
    expect(maskPii('nguyenvana@ttdt.edu.vn')).toBe('ng***@ttdt.edu.vn')
  })
  it('chuỗi quá ngắn thì che hoàn toàn', () => {
    expect(maskPii('0912')).toBe('***')
  })
})
