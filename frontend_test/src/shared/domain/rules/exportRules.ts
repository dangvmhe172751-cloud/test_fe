import type { Role } from '../types'
import type { Rule, Violation } from './types'

export interface ExportRequest {
  id: string
  /** khoá báo cáo, ví dụ 'students' | 'timetable' */
  report: string
  reportLabel: string
  rowCount: number
  /** mô tả bộ lọc đang áp dụng, sẽ được ghi vào sheet "Thông tin" */
  filters: Record<string, string>
  /** có cột PII trong danh sách cột yêu cầu xuất không */
  hasPiiColumns: boolean
}

/** X01 — chỉ 2 vai này được xem dữ liệu cá nhân đầy đủ */
export function canSeePII(role: Role): boolean {
  return role === 'admin' || role === 'academic'
}

export const MAX_EXPORT_ROWS = 50_000

const v = (
  ruleId: string,
  severity: Violation['severity'],
  req: ExportRequest,
  message: string,
  suggestion?: string,
): Violation => ({
  ruleId,
  domain: 'export',
  severity,
  message,
  subjectId: req.id,
  suggestion,
})

export const X01_piiMasking: Rule<ExportRequest> = {
  id: 'X01',
  domain: 'export',
  severity: 'info',
  label: 'Che dữ liệu cá nhân theo quyền',
  check(req, ctx) {
    if (!req.hasPiiColumns || canSeePII(ctx.actor.role)) return []
    return [
      v('X01', 'info', req, 'Vai trò hiện tại không được xem đầy đủ SĐT/email — sẽ xuất dạng che'),
    ]
  },
}

export const X02_rowLimit: Rule<ExportRequest> = {
  id: 'X02',
  domain: 'export',
  severity: 'error',
  label: 'Vượt giới hạn số dòng',
  check(req) {
    if (req.rowCount <= MAX_EXPORT_ROWS) return []
    return [
      v(
        'X02',
        'error',
        req,
        `Kết quả ${req.rowCount.toLocaleString('vi-VN')} dòng, vượt giới hạn ${MAX_EXPORT_ROWS.toLocaleString('vi-VN')}`,
        'Thu hẹp bộ lọc (theo khoảng thời gian hoặc theo lớp) rồi xuất lại',
      ),
    ]
  },
}

export const X03_emptyResult: Rule<ExportRequest> = {
  id: 'X03',
  domain: 'export',
  severity: 'error',
  label: 'Không có dữ liệu để xuất',
  check(req) {
    if (req.rowCount > 0) return []
    return [v('X03', 'error', req, 'Bộ lọc hiện tại không có dòng nào')]
  },
}

export const EXPORT_RULES: Rule<ExportRequest>[] = [X01_piiMasking, X02_rowLimit, X03_emptyResult]
