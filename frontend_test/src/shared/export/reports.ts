import { logExport } from '@/mocks/api'
import { computeMetric, roomUtilizationByRoom, teacherHoursByTeacher } from '@/shared/domain/metrics'
import type { Period } from '@/shared/domain/metrics'
import { validate } from '@/shared/domain/rules/engine'
import { EXPORT_RULES } from '@/shared/domain/rules/exportRules'
import type { ExportRequest } from '@/shared/domain/rules/exportRules'
import { SCHEDULE_RULES } from '@/shared/domain/rules/schedule'
import type { RuleContext, Violation } from '@/shared/domain/rules/types'
import { fmtDateVi, fmtMin, WEEKDAY_LABEL, weekdayOf } from '@/shared/domain/time'
import type { Enrollment, Session, Student, Teacher } from '@/shared/domain/types'
import type { ExportColumn } from './xlsx'
import { exportXlsx } from './xlsx'

export interface ReportResult {
  ok: boolean
  violations: Violation[]
}

/** Chạy EXPORT_RULES trước khi tạo file — chặn nếu có ERROR (X02/X03) */
async function runExport<T>(params: {
  ctx: RuleContext
  report: string
  title: string
  fileSlug: string
  sheetName: string
  columns: ExportColumn<T>[]
  rows: T[]
  filters: Record<string, string>
}): Promise<ReportResult> {
  const req: ExportRequest = {
    id: `${params.report}-${Date.now()}`,
    report: params.report,
    reportLabel: params.title,
    rowCount: params.rows.length,
    filters: params.filters,
    hasPiiColumns: params.columns.some((c) => c.pii),
  }
  const violations = validate([req], EXPORT_RULES, params.ctx)
  if (violations.some((v) => v.severity === 'error')) return { ok: false, violations }

  const actorUser = params.ctx.data.users.find((u) => u.id === params.ctx.actor.id)
  await exportXlsx({
    fileSlug: params.fileSlug,
    sheetName: params.sheetName,
    title: params.title,
    columns: params.columns,
    rows: params.rows,
    meta: params.filters,
    actor: { role: params.ctx.actor.role, name: actorUser?.fullName ?? 'Không rõ' },
  })
  logExport({
    report: params.report,
    rowCount: params.rows.length,
    filters: JSON.stringify(params.filters),
  })
  return { ok: true, violations }
}

const STUDENT_STATUS: Record<Student['status'], string> = {
  active: 'Đang học',
  paused: 'Tạm dừng',
  debt: 'Nợ học phí',
  graduated: 'Đã tốt nghiệp',
}

export function exportStudents(ctx: RuleContext, rows: Student[], filters: Record<string, string>) {
  const columns: ExportColumn<Student>[] = [
    { key: 'code', header: 'Mã học viên', width: 14, value: (r) => r.code },
    { key: 'fullName', header: 'Họ và tên', width: 26, value: (r) => r.fullName },
    { key: 'dob', header: 'Ngày sinh', width: 14, type: 'date', value: (r) => new Date(`${r.dob}T00:00:00`) },
    { key: 'level', header: 'Trình độ', width: 12, value: (r) => r.level ?? '' },
    { key: 'guardian', header: 'Phụ huynh', width: 24, value: (r) => r.guardian.name },
    { key: 'phone', header: 'SĐT phụ huynh', width: 18, pii: true, value: (r) => r.guardian.phone },
    { key: 'status', header: 'Trạng thái', width: 16, value: (r) => STUDENT_STATUS[r.status] },
    {
      key: 'classes',
      header: 'Số lớp đang học',
      width: 16,
      type: 'number',
      value: (r) =>
        (ctx.index.enrollmentsByStudent.get(r.id) ?? []).filter((e) => e.status === 'confirmed')
          .length,
    },
  ]
  return runExport({
    ctx,
    report: 'students',
    title: 'Danh sách học viên',
    fileSlug: 'danh-sach-hoc-vien',
    sheetName: 'Học viên',
    columns,
    rows,
    filters,
  })
}

export function exportTeachers(ctx: RuleContext, rows: Teacher[], filters: Record<string, string>) {
  const period: Period = filters.__period
    ? JSON.parse(filters.__period)
    : { from: '1900-01-01', to: '2999-01-01' }
  const load = new Map(teacherHoursByTeacher(period, ctx).map((t) => [t.teacherId, t]))
  const columns: ExportColumn<Teacher>[] = [
    { key: 'code', header: 'Mã GV', width: 12, value: (r) => r.code },
    { key: 'fullName', header: 'Họ và tên', width: 26, value: (r) => r.fullName },
    { key: 'email', header: 'Email', width: 26, pii: true, value: (r) => r.email },
    { key: 'phone', header: 'Điện thoại', width: 16, pii: true, value: (r) => r.phone },
    {
      key: 'subjects',
      header: 'Chuyên môn',
      width: 30,
      value: (r) =>
        r.subjectIds.map((id) => ctx.data.subjects.find((s) => s.id === id)?.name ?? id).join(', '),
    },
    { key: 'maxHours', header: 'Giới hạn giờ/tuần', width: 18, type: 'number', value: (r) => r.maxHoursPerWeek },
    { key: 'hours', header: 'Giờ dạy trong kỳ', width: 18, type: 'number', value: (r) => load.get(r.id)?.hours ?? 0 },
    { key: 'status', header: 'Trạng thái', width: 14, value: (r) => (r.status === 'active' ? 'Đang dạy' : 'Ngừng') },
  ]
  return runExport({
    ctx,
    report: 'teachers',
    title: 'Danh sách giáo viên',
    fileSlug: 'danh-sach-giao-vien',
    sheetName: 'Giáo viên',
    columns,
    rows,
    filters,
  })
}

export function exportTimetable(ctx: RuleContext, rows: Session[], filters: Record<string, string>) {
  const columns: ExportColumn<Session>[] = [
    { key: 'date', header: 'Ngày', width: 14, type: 'date', value: (r) => new Date(`${r.date}T00:00:00`) },
    { key: 'weekday', header: 'Thứ', width: 8, value: (r) => WEEKDAY_LABEL[weekdayOf(r.date)] },
    { key: 'time', header: 'Giờ học', width: 16, value: (r) => `${fmtMin(r.startMin)}–${fmtMin(r.endMin)}` },
    {
      key: 'class',
      header: 'Lớp',
      width: 18,
      value: (r) => ctx.data.classGroups.find((c) => c.id === r.classGroupId)?.name ?? r.classGroupId,
    },
    {
      key: 'course',
      header: 'Khóa học',
      width: 28,
      value: (r) => {
        const cls = ctx.data.classGroups.find((c) => c.id === r.classGroupId)
        return ctx.data.courses.find((c) => c.id === cls?.courseId)?.name ?? ''
      },
    },
    {
      key: 'teacher',
      header: 'Giáo viên',
      width: 24,
      value: (r) => ctx.data.teachers.find((t) => t.id === r.teacherId)?.fullName ?? r.teacherId,
    },
    { key: 'room', header: 'Phòng', width: 12, value: (r) => ctx.data.rooms.find((x) => x.id === r.roomId)?.name ?? r.roomId },
    {
      key: 'students',
      header: 'Sĩ số',
      width: 10,
      type: 'number',
      value: (r) => (ctx.index.confirmedByClass.get(r.classGroupId) ?? []).length,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 14,
      value: (r) => ({ scheduled: 'Đã xếp', done: 'Đã dạy', cancelled: 'Đã huỷ' })[r.status],
    },
    {
      key: 'conflict',
      header: 'Xung đột',
      width: 40,
      value: (r) => {
        const v = validate([r], SCHEDULE_RULES, ctx).filter((x) => x.severity !== 'info')
        return v.map((x) => `[${x.ruleId}] ${x.message}`).join(' | ')
      },
    },
  ]
  return runExport({
    ctx,
    report: 'timetable',
    title: 'Thời khóa biểu',
    fileSlug: 'thoi-khoa-bieu',
    sheetName: 'Thời khóa biểu',
    columns,
    rows,
    filters,
  })
}

export function exportEnrollments(
  ctx: RuleContext,
  rows: Enrollment[],
  filters: Record<string, string>,
) {
  const STATUS: Record<Enrollment['status'], string> = {
    pending: 'Chờ xác nhận học phí',
    confirmed: 'Chính thức',
    waitlisted: 'Hàng chờ',
    withdrawn: 'Đã rút',
    transferred: 'Đã chuyển lớp',
  }
  const columns: ExportColumn<Enrollment>[] = [
    { key: 'id', header: 'Mã đăng ký', width: 14, value: (r) => r.id },
    {
      key: 'student',
      header: 'Học viên',
      width: 26,
      value: (r) => ctx.data.students.find((s) => s.id === r.studentId)?.fullName ?? r.studentId,
    },
    {
      key: 'studentCode',
      header: 'Mã HV',
      width: 14,
      value: (r) => ctx.data.students.find((s) => s.id === r.studentId)?.code ?? '',
    },
    {
      key: 'class',
      header: 'Lớp',
      width: 18,
      value: (r) => ctx.data.classGroups.find((c) => c.id === r.classGroupId)?.name ?? r.classGroupId,
    },
    { key: 'status', header: 'Trạng thái', width: 22, value: (r) => STATUS[r.status] },
    { key: 'wl', header: 'Vị trí hàng chờ', width: 16, type: 'number', value: (r) => r.waitlistPosition ?? '' },
    { key: 'createdAt', header: 'Ngày đăng ký', width: 16, type: 'date', value: (r) => new Date(r.createdAt) },
  ]
  return runExport({
    ctx,
    report: 'enrollments',
    title: 'Danh sách đăng ký',
    fileSlug: 'danh-sach-dang-ky',
    sheetName: 'Đăng ký',
    columns,
    rows,
    filters,
  })
}

export function exportRoomUtilization(ctx: RuleContext, period: Period) {
  const rows = roomUtilizationByRoom(period, ctx)
  const columns: ExportColumn<(typeof rows)[number]>[] = [
    { key: 'name', header: 'Phòng', width: 20, value: (r) => r.name },
    { key: 'used', header: 'Giờ đã dùng', width: 16, type: 'number', value: (r) => r.usedHours },
    { key: 'open', header: 'Giờ mở cửa', width: 16, type: 'number', value: (r) => r.openHours },
    { key: 'rate', header: 'Tỉ lệ sử dụng', width: 16, type: 'percent', value: (r) => r.rate },
  ]
  return runExport({
    ctx,
    report: 'room-utilization',
    title: 'Báo cáo sử dụng phòng',
    fileSlug: 'bao-cao-su-dung-phong',
    sheetName: 'Sử dụng phòng',
    columns,
    rows,
    filters: { 'Từ ngày': fmtDateVi(period.from), 'Đến trước ngày': fmtDateVi(period.to) },
  })
}

export function exportDashboard(ctx: RuleContext, period: Period) {
  const keys = [
    'activeStudents',
    'runningClasses',
    'sessionsInPeriod',
    'classFillRate',
    'roomUtilization',
    'openConflicts',
    'waitlistDepth',
    'attendanceRate',
    'cancelRate',
  ] as const
  const rows = keys.map((k) => computeMetric(k, period, ctx))
  const columns: ExportColumn<(typeof rows)[number]>[] = [
    { key: 'label', header: 'Chỉ số', width: 26, value: (r) => r.spec.label },
    {
      key: 'value',
      header: 'Giá trị',
      width: 16,
      value: (r) => (r.value == null ? '—' : r.spec.unit === 'percent' ? r.value : r.value),
    },
    { key: 'num', header: 'Tử số', width: 12, type: 'number', value: (r) => r.numerator ?? '' },
    { key: 'den', header: 'Mẫu số', width: 12, type: 'number', value: (r) => r.denominator ?? '' },
    { key: 'formula', header: 'Công thức', width: 70, value: (r) => r.spec.formula },
  ]
  return runExport({
    ctx,
    report: 'dashboard',
    title: 'Tổng quan thống kê',
    fileSlug: 'tong-quan-thong-ke',
    sheetName: 'Thống kê',
    columns,
    rows,
    filters: { 'Từ ngày': fmtDateVi(period.from), 'Đến trước ngày': fmtDateVi(period.to) },
  })
}
