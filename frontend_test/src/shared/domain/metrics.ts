import { effectiveCapacity } from './rules/enrollment'
import { validate } from './rules/engine'
import { SCHEDULE_RULES } from './rules/schedule'
import type { RuleContext } from './rules/types'
import { hoursOf, weekdayOf } from './time'
import type { DateStr, ID } from './types'

/** M02 — khoảng thời gian luôn nửa mở [from, to), thống nhất với quy ước giờ */
export interface Period {
  from: DateStr
  /** KHÔNG bao gồm ngày này */
  to: DateStr
}

export const inPeriod = (date: DateStr, p: Period) => date >= p.from && date < p.to

export type MetricKey =
  | 'activeStudents'
  | 'runningClasses'
  | 'sessionsInPeriod'
  | 'classFillRate'
  | 'roomUtilization'
  | 'teacherHours'
  | 'openConflicts'
  | 'waitlistDepth'
  | 'attendanceRate'
  | 'cancelRate'

export interface MetricSpec {
  key: MetricKey
  label: string
  unit: 'count' | 'percent' | 'hours'
  /** mô tả tử số / mẫu số để mọi người đọc dashboard hiểu con số đến từ đâu (M01) */
  formula: string
}

/** M01 — mỗi chỉ số khai báo ĐÚNG MỘT LẦN ở đây. Cấm component tự filter().length */
export const METRICS: Record<MetricKey, MetricSpec> = {
  activeStudents: {
    key: 'activeStudents',
    label: 'Học viên đang học',
    unit: 'count',
    formula: 'Số học viên status=active có ít nhất 1 enrollment confirmed ở lớp chưa kết thúc',
  },
  runningClasses: {
    key: 'runningClasses',
    label: 'Lớp đang chạy',
    unit: 'count',
    formula: 'Lớp status=published và khoảng ngày giao với kỳ báo cáo',
  },
  sessionsInPeriod: {
    key: 'sessionsInPeriod',
    label: 'Buổi học trong kỳ',
    unit: 'count',
    formula: 'Session trong [from,to) và status≠cancelled (M03)',
  },
  classFillRate: {
    key: 'classFillRate',
    label: 'Tỉ lệ lấp đầy lớp',
    unit: 'percent',
    formula: 'Σ enrollment confirmed / Σ min(course.maxStudents, room.capacity) — pending và waitlist không tính (M04)',
  },
  roomUtilization: {
    key: 'roomUtilization',
    label: 'Tỉ lệ sử dụng phòng',
    unit: 'percent',
    formula: 'Σ giờ có buổi học / Σ giờ mở cửa của phòng trong [from,to)',
  },
  teacherHours: {
    key: 'teacherHours',
    label: 'Giờ dạy trong kỳ',
    unit: 'hours',
    formula: 'Σ (endMin-startMin)/60 của session status≠cancelled',
  },
  openConflicts: {
    key: 'openConflicts',
    label: 'Xung đột tồn đọng',
    unit: 'count',
    formula: 'Số buổi trong kỳ có ít nhất 1 vi phạm severity=error khi chạy SCHEDULE_RULES',
  },
  waitlistDepth: {
    key: 'waitlistDepth',
    label: 'Đang chờ xếp lớp',
    unit: 'count',
    formula: 'Số enrollment status=waitlisted',
  },
  attendanceRate: {
    key: 'attendanceRate',
    label: 'Tỉ lệ chuyên cần',
    unit: 'percent',
    formula: 'present + late / tổng bản ghi điểm danh của buổi trong kỳ',
  },
  cancelRate: {
    key: 'cancelRate',
    label: 'Tỉ lệ buổi bị huỷ',
    unit: 'percent',
    formula: 'session cancelled / tổng session trong kỳ (M03: giữ ở mẫu số)',
  },
}

export interface MetricResult {
  key: MetricKey
  spec: MetricSpec
  /** M05 — mẫu số = 0 thì trả null, tầng UI hiển thị "—", tuyệt đối không 0% hay NaN */
  value: number | null
  numerator?: number
  denominator?: number
  /** M06 — id để drill-down ra đúng danh sách tạo nên con số */
  drilldownIds: ID[]
}

const nullResult = (key: MetricKey, ids: ID[] = []): MetricResult => ({
  key,
  spec: METRICS[key],
  value: null,
  drilldownIds: ids,
})

const ratio = (key: MetricKey, num: number, den: number, ids: ID[]): MetricResult =>
  den === 0
    ? nullResult(key, ids)
    : { key, spec: METRICS[key], value: num / den, numerator: num, denominator: den, drilldownIds: ids }

export function computeMetric(key: MetricKey, period: Period, ctx: RuleContext): MetricResult {
  const { data, index } = ctx

  const sessionsInRange = data.sessions.filter((s) => inPeriod(s.date, period))
  const liveSessions = sessionsInRange.filter((s) => s.status !== 'cancelled')

  switch (key) {
    case 'activeStudents': {
      const openClassIds = new Set(
        data.classGroups.filter((c) => c.status === 'published').map((c) => c.id),
      )
      const ids = data.students
        .filter(
          (st) =>
            st.status === 'active' &&
            (index.enrollmentsByStudent.get(st.id) ?? []).some(
              (e) => e.status === 'confirmed' && openClassIds.has(e.classGroupId),
            ),
        )
        .map((st) => st.id)
      return { key, spec: METRICS[key], value: ids.length, drilldownIds: ids }
    }

    case 'runningClasses': {
      const ids = data.classGroups
        .filter(
          (c) => c.status === 'published' && c.startDate < period.to && c.endDate >= period.from,
        )
        .map((c) => c.id)
      return { key, spec: METRICS[key], value: ids.length, drilldownIds: ids }
    }

    case 'sessionsInPeriod':
      return {
        key,
        spec: METRICS[key],
        value: liveSessions.length,
        drilldownIds: liveSessions.map((s) => s.id),
      }

    case 'classFillRate': {
      const running = data.classGroups.filter(
        (c) => c.status === 'published' && c.startDate < period.to && c.endDate >= period.from,
      )
      let num = 0
      let den = 0
      for (const cls of running) {
        const course = data.courses.find((c) => c.id === cls.courseId)
        const cap = effectiveCapacity(ctx, cls, course)
        if (!Number.isFinite(cap)) continue
        num += (index.confirmedByClass.get(cls.id) ?? []).length // M04
        den += cap
      }
      return ratio(key, num, den, running.map((c) => c.id))
    }

    case 'roomUtilization': {
      let used = 0
      let open = 0
      for (const room of data.rooms) {
        for (const s of liveSessions.filter((x) => x.roomId === room.id)) used += hoursOf(s)
        for (const d of datesBetween(period)) {
          const wd = weekdayOf(d)
          for (const w of room.openHours.filter((o) => o.weekday === wd)) open += hoursOf(w)
        }
      }
      return ratio(key, used, open, data.rooms.map((r) => r.id))
    }

    case 'teacherHours': {
      const hours = liveSessions.reduce((sum, s) => sum + hoursOf(s), 0)
      return {
        key,
        spec: METRICS[key],
        value: hours,
        drilldownIds: liveSessions.map((s) => s.id),
      }
    }

    case 'openConflicts': {
      const bad = new Set<ID>()
      for (const s of liveSessions) {
        const violations = validate([s], SCHEDULE_RULES, ctx)
        if (violations.some((x) => x.severity === 'error')) bad.add(s.id)
      }
      return { key, spec: METRICS[key], value: bad.size, drilldownIds: [...bad] }
    }

    case 'waitlistDepth': {
      const ids = data.enrollments.filter((e) => e.status === 'waitlisted').map((e) => e.id)
      return { key, spec: METRICS[key], value: ids.length, drilldownIds: ids }
    }

    case 'attendanceRate': {
      const sessionIds = new Set(liveSessions.map((s) => s.id))
      const records = data.attendances.filter((a) => sessionIds.has(a.sessionId))
      const present = records.filter((a) => a.status === 'present' || a.status === 'late').length
      return ratio(key, present, records.length, records.map((a) => a.id))
    }

    case 'cancelRate': {
      const cancelled = sessionsInRange.filter((s) => s.status === 'cancelled') // M03
      return ratio(key, cancelled.length, sessionsInRange.length, cancelled.map((s) => s.id))
    }

    default:
      return nullResult(key)
  }
}

function datesBetween(p: Period): DateStr[] {
  const out: DateStr[] = []
  const start = new Date(`${p.from}T00:00:00Z`).getTime()
  const end = new Date(`${p.to}T00:00:00Z`).getTime()
  for (let t = start; t < end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

/** Tỉ lệ sử dụng riêng từng phòng — dùng cho biểu đồ dashboard */
export function roomUtilizationByRoom(period: Period, ctx: RuleContext) {
  const days = datesBetween(period)
  return ctx.data.rooms.map((room) => {
    const used = ctx.data.sessions
      .filter((s) => s.roomId === room.id && s.status !== 'cancelled' && inPeriod(s.date, period))
      .reduce((sum, s) => sum + hoursOf(s), 0)
    const open = days.reduce((sum, d) => {
      const wd = weekdayOf(d)
      return sum + room.openHours.filter((o) => o.weekday === wd).reduce((a, o) => a + hoursOf(o), 0)
    }, 0)
    return {
      roomId: room.id,
      name: room.name,
      usedHours: Math.round(used * 10) / 10,
      openHours: Math.round(open * 10) / 10,
      rate: open === 0 ? null : used / open, // M05
    }
  })
}

/** Giờ dạy theo từng giáo viên trong kỳ */
export function teacherHoursByTeacher(period: Period, ctx: RuleContext) {
  return ctx.data.teachers.map((t) => {
    const sessions = ctx.data.sessions.filter(
      (s) => s.teacherId === t.id && s.status !== 'cancelled' && inPeriod(s.date, period),
    )
    return {
      teacherId: t.id,
      name: t.fullName,
      hours: Math.round(sessions.reduce((sum, s) => sum + hoursOf(s), 0) * 10) / 10,
      maxHoursPerWeek: t.maxHoursPerWeek,
      sessionCount: sessions.length,
    }
  })
}

export const fmtMetric = (m: MetricResult): string => {
  if (m.value == null) return '—' // M05
  if (m.spec.unit === 'percent') return `${(m.value * 100).toFixed(1)}%`
  if (m.spec.unit === 'hours') return `${m.value.toFixed(1)}h`
  return m.value.toLocaleString('vi-VN')
}
