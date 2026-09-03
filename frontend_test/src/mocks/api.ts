import { generateSessions } from '@/shared/domain/generate'
import { isBlocked, validate } from '@/shared/domain/rules/engine'
import {
  ENROLLMENT_RULES,
  TRANSFER_RULES,
  effectiveCapacity,
} from '@/shared/domain/rules/enrollment'
import { SCHEDULE_RULES } from '@/shared/domain/rules/schedule'
import type { RuleContext, Violation } from '@/shared/domain/rules/types'
import type {
  ClassGroup,
  Enrollment,
  EnrollmentStatus,
  ID,
  Session,
} from '@/shared/domain/types'
import { makeContext, useDb } from './store'

export interface WriteResult {
  ok: boolean
  violations: Violation[]
}

const db = () => useDb.getState()
const ctxNow = (ignoreIds: ID[] = []): RuleContext =>
  makeContext(db().data, { ignoreIds: new Set(ignoreIds), actor: db().actor })

/**
 * Cổng ghi DUY NHẤT cho lịch: validate trước, chỉ ghi khi không có ERROR.
 * `force` cho phép bỏ qua WARNING sau khi người dùng xác nhận — không bao giờ bỏ qua ERROR.
 */
export function saveSession(next: Session): WriteResult {
  const ctx = ctxNow([next.id])
  const violations = validate([next], SCHEDULE_RULES, ctx)
  if (isBlocked(violations)) return { ok: false, violations }

  db().apply((draft) => {
    const i = draft.sessions.findIndex((s) => s.id === next.id)
    if (i >= 0) draft.sessions[i] = next
    else draft.sessions.push(next)

    // R14 — lớp đã công bố bị đổi lịch thì sinh thông báo cho học viên
    if (violations.some((v) => v.ruleId === 'R14')) {
      const students = draft.enrollments.filter(
        (e) => e.classGroupId === next.classGroupId && e.status === 'confirmed',
      )
      for (const e of students) {
        draft.notifications.push({
          id: `NT${draft.notifications.length + 1}`,
          at: new Date().toISOString(),
          audience: { kind: 'student', id: e.studentId },
          message: `Lớp ${next.classGroupId} đổi lịch buổi ${next.date}`,
          read: false,
        })
      }
    }
  })
  return { ok: true, violations }
}

export function cancelSession(sessionId: ID, reason: string): WriteResult {
  db().apply((draft) => {
    const i = draft.sessions.findIndex((s) => s.id === sessionId)
    if (i >= 0) draft.sessions[i] = { ...draft.sessions[i], status: 'cancelled', note: reason }
  })
  return { ok: true, violations: [] }
}

/** Dry-run cho drag & drop: kiểm tra mà không ghi */
export function previewSession(next: Session): Violation[] {
  return validate([next], SCHEDULE_RULES, ctxNow([next.id]))
}

// -------------------------------------------------------------- mở lớp
export interface CreateClassInput {
  courseId: ID
  name: string
  teacherId: ID
  roomId: ID
  startDate: string
  weekdays: number[]
  startMin: number
  endMin: number
  totalSessions: number
}

export function buildDraftClass(input: CreateClassInput, ctx: RuleContext) {
  const holidaySet = new Set(ctx.data.holidays.flatMap((h) => spanDates(h.from, h.to)))
  const classId = nextClassId(ctx)
  const sessions = generateSessions({
    classGroupId: classId,
    startDate: input.startDate,
    totalSessions: input.totalSessions,
    weekdays: input.weekdays,
    startMin: input.startMin,
    endMin: input.endMin,
    teacherId: input.teacherId,
    roomId: input.roomId,
    skipDates: holidaySet,
  })
  const cls: ClassGroup = {
    id: classId,
    courseId: input.courseId,
    name: input.name,
    startDate: input.startDate,
    endDate: sessions.at(-1)?.date ?? input.startDate,
    primaryTeacherId: input.teacherId,
    defaultRoomId: input.roomId,
    pattern: { weekdays: input.weekdays as never, startMin: input.startMin, endMin: input.endMin },
    status: 'draft',
  }
  return { cls, sessions }
}

/** Validate cả lô buổi của lớp nháp — lớp chưa nằm trong store nên phải ghép tạm vào context */
export function validateDraftClass(cls: ClassGroup, sessions: Session[]): Violation[] {
  const base = db().data
  const merged = { ...base, classGroups: [...base.classGroups, cls] }
  const ctx = makeContext(merged, { actor: db().actor })
  return validate(sessions, SCHEDULE_RULES, ctx)
}

export function publishClass(cls: ClassGroup, sessions: Session[]): WriteResult {
  const violations = validateDraftClass(cls, sessions)
  if (isBlocked(violations)) return { ok: false, violations }
  db().apply((draft) => {
    draft.classGroups.push({ ...cls, status: 'published' })
    draft.sessions.push(...sessions)
  })
  return { ok: true, violations }
}

// -------------------------------------------------------------- đăng ký
export interface EnrollResult extends WriteResult {
  /** trạng thái hệ thống đã quyết định — có thể khác mong muốn (đầy lớp → waitlist) */
  finalStatus?: EnrollmentStatus
  enrollmentId?: ID
}

/**
 * Đăng ký học. Quy tắc quyết định trạng thái:
 * - có ERROR ngoài E04 → từ chối
 * - chỉ vướng E04 (đầy lớp) → xếp hàng chờ
 * - còn lại → pending nếu chưa xác nhận học phí, confirmed nếu đã xác nhận
 */
export function enroll(
  studentId: ID,
  classGroupId: ID,
  opts: { tuitionPaid?: boolean } = {},
): EnrollResult {
  const ctx = ctxNow()
  const candidate: Enrollment = {
    id: `EN-${Date.now()}`,
    studentId,
    classGroupId,
    status: opts.tuitionPaid ? 'confirmed' : 'pending',
    createdAt: new Date().toISOString(),
    confirmedAt: opts.tuitionPaid ? new Date().toISOString() : undefined,
    holdExpiresAt: opts.tuitionPaid
      ? undefined
      : new Date(Date.now() + ctx.data.settings.enrollmentHoldHours * 3600_000).toISOString(),
  }

  const violations = validate([candidate], ENROLLMENT_RULES, ctx)
  const errors = violations.filter((v) => v.severity === 'error')
  const onlyFull = errors.length > 0 && errors.every((v) => v.ruleId === 'E04')
  if (errors.length && !onlyFull) return { ok: false, violations }

  const finalStatus: EnrollmentStatus = onlyFull ? 'waitlisted' : candidate.status
  const record: Enrollment = {
    ...candidate,
    status: finalStatus,
    waitlistPosition: onlyFull
      ? (ctx.index.waitlistByClass.get(classGroupId)?.length ?? 0) + 1
      : undefined,
  }
  db().apply((draft) => draft.enrollments.push(record))
  return { ok: true, violations, finalStatus, enrollmentId: record.id }
}

export function confirmPayment(enrollmentId: ID): WriteResult {
  const ctx = ctxNow()
  const current = ctx.data.enrollments.find((e) => e.id === enrollmentId)
  if (!current) return { ok: false, violations: [] }
  const next: Enrollment = { ...current, status: 'confirmed', confirmedAt: new Date().toISOString() }
  // xác nhận học phí = chiếm chỗ thật → phải chạy lại toàn bộ luật
  const violations = validate([next], ENROLLMENT_RULES, ctx)
  if (isBlocked(violations)) return { ok: false, violations }
  db().apply((draft) => {
    const i = draft.enrollments.findIndex((e) => e.id === enrollmentId)
    if (i >= 0) draft.enrollments[i] = next
  })
  return { ok: true, violations }
}

export function withdraw(enrollmentId: ID): WriteResult {
  const ctx = ctxNow()
  const current = ctx.data.enrollments.find((e) => e.id === enrollmentId)
  if (!current) return { ok: false, violations: [] }
  const next: Enrollment = { ...current, status: 'withdrawn' }
  const violations = validate([next], ENROLLMENT_RULES, ctx) // E12 cảnh báo rút muộn

  db().apply((draft) => {
    const i = draft.enrollments.findIndex((e) => e.id === enrollmentId)
    if (i >= 0) draft.enrollments[i] = next
  })
  // E13 — có chỗ trống thì mời người đầu hàng chờ
  promoteWaitlist(current.classGroupId)
  return { ok: true, violations }
}

/** E13 — chuyển hàng chờ thành chính thức, vẫn phải qua lại E04 + E05 */
export function promoteWaitlist(classGroupId: ID): EnrollResult {
  const ctx = ctxNow()
  const cls = ctx.data.classGroups.find((c) => c.id === classGroupId)
  if (!cls) return { ok: false, violations: [] }
  const course = ctx.data.courses.find((c) => c.id === cls.courseId)
  const cap = effectiveCapacity(ctx, cls, course)
  const taken = (ctx.index.confirmedByClass.get(classGroupId) ?? []).length
  if (taken >= cap) return { ok: false, violations: [] }

  const first = (ctx.index.waitlistByClass.get(classGroupId) ?? [])[0]
  if (!first) return { ok: false, violations: [] }

  const next: Enrollment = {
    ...first,
    status: 'confirmed',
    waitlistPosition: undefined,
    confirmedAt: new Date().toISOString(),
  }
  const violations = validate([next], ENROLLMENT_RULES, ctx)
  if (isBlocked(violations)) return { ok: false, violations }

  db().apply((draft) => {
    const i = draft.enrollments.findIndex((e) => e.id === first.id)
    if (i >= 0) draft.enrollments[i] = next
    // dồn lại số thứ tự hàng chờ
    draft.enrollments
      .filter((e) => e.classGroupId === classGroupId && e.status === 'waitlisted')
      .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0))
      .forEach((e, idx) => {
        const j = draft.enrollments.findIndex((x) => x.id === e.id)
        draft.enrollments[j] = { ...e, waitlistPosition: idx + 1 }
      })
  })
  return { ok: true, violations, finalStatus: 'confirmed', enrollmentId: next.id }
}

/**
 * E11 — chuyển lớp. Kiểm tra lớp đích TRƯỚC, chỉ khi đích hợp lệ mới rút lớp nguồn.
 * Thứ tự này là điểm mấu chốt: làm ngược lại sẽ khiến học viên mất chỗ cả hai bên.
 */
export function transferClass(enrollmentId: ID, targetClassId: ID): EnrollResult {
  const ctx = ctxNow()
  const source = ctx.data.enrollments.find((e) => e.id === enrollmentId)
  if (!source) return { ok: false, violations: [] }

  const candidate: Enrollment = {
    id: `EN-${Date.now()}`,
    studentId: source.studentId,
    classGroupId: targetClassId,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
  }
  const violations = validate([candidate], TRANSFER_RULES, ctx)
  if (isBlocked(violations)) return { ok: false, violations }

  db().apply((draft) => {
    const i = draft.enrollments.findIndex((e) => e.id === enrollmentId)
    if (i >= 0) draft.enrollments[i] = { ...source, status: 'transferred' }
    draft.enrollments.push(candidate)
  })
  promoteWaitlist(source.classGroupId)
  return { ok: true, violations, finalStatus: 'confirmed', enrollmentId: candidate.id }
}

// -------------------------------------------------------------- tiện ích
function nextClassId(ctx: RuleContext): ID {
  const n = ctx.data.classGroups.length + 1
  return `L${String(n).padStart(2, '0')}`
}

function spanDates(from: string, to: string): string[] {
  const out: string[] = []
  const start = new Date(`${from}T00:00:00Z`).getTime()
  const end = new Date(`${to}T00:00:00Z`).getTime()
  for (let t = start; t <= end; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

export function logExport(entry: { report: string; rowCount: number; filters: string }) {
  db().apply((draft) => {
    draft.exportLogs.push({
      id: `EX${draft.exportLogs.length + 1}`,
      at: new Date().toISOString(),
      actorId: db().actor.id,
      ...entry,
    })
  })
}
