import { validate, isBlocked } from './rules/engine'
import { SCHEDULE_RULES } from './rules/schedule'
import type { RuleContext } from './rules/types'
import { addDays, weekdayOf } from './time'
import type { DateStr, ID, Minute, Session, Slot } from './types'

export interface SlotRequest {
  classGroupId: ID
  teacherId: ID
  roomId: ID
  durationMin: number
  fromDate: DateStr
  /** số ngày quét tới */
  horizonDays?: number
  /** bước nhảy khi dò khe, mặc định 30 phút */
  stepMin?: Minute
}

/**
 * Gợi ý khe trống = giao của (giờ rảnh GV) ∩ (giờ mở phòng/trung tâm) ∩ (không buổi nào)
 * Cách làm: sinh ứng viên rồi chạy đúng bộ SCHEDULE_RULES — không nhân bản logic.
 */
export function suggestSlots(req: SlotRequest, ctx: RuleContext, limit = 8): Slot[] {
  const horizon = req.horizonDays ?? 14
  const step = req.stepMin ?? 30
  const teacher = ctx.data.teachers.find((t) => t.id === req.teacherId)
  const out: Slot[] = []

  for (let d = 0; d < horizon && out.length < limit; d++) {
    const date = addDays(req.fromDate, d)
    const wd = weekdayOf(date)
    const windows = (teacher?.availability ?? ctx.data.settings.openHours).filter(
      (a) => a.weekday === wd,
    )

    for (const w of windows) {
      for (let start = w.startMin; start + req.durationMin <= w.endMin; start += step) {
        if (out.length >= limit) break
        const candidate: Session = {
          id: '__suggest__',
          classGroupId: req.classGroupId,
          date,
          startMin: start,
          endMin: start + req.durationMin,
          teacherId: req.teacherId,
          roomId: req.roomId,
          status: 'scheduled',
        }
        // R09 (ngoài khoảng ngày lớp) bị bỏ qua khi gợi ý cho lớp đang tạo mới
        const violations = validate([candidate], SCHEDULE_RULES, ctx).filter(
          (v) => v.ruleId !== 'R09',
        )
        if (!isBlocked(violations)) {
          out.push({ date, startMin: candidate.startMin, endMin: candidate.endMin })
        }
      }
    }
  }
  return out
}

/** Gợi ý phòng thay thế cho 1 buổi đang bị xung đột */
export function suggestRooms(session: Session, ctx: RuleContext, limit = 5): ID[] {
  const out: ID[] = []
  for (const room of ctx.data.rooms) {
    if (room.id === session.roomId || out.length >= limit) continue
    const violations = validate([{ ...session, roomId: room.id }], SCHEDULE_RULES, ctx)
    if (!isBlocked(violations)) out.push(room.id)
  }
  return out
}

/** Gợi ý giáo viên dạy thay cho 1 buổi */
export function suggestTeachers(session: Session, ctx: RuleContext, limit = 5): ID[] {
  const out: ID[] = []
  for (const t of ctx.data.teachers) {
    if (t.id === session.teacherId || out.length >= limit) continue
    const violations = validate([{ ...session, teacherId: t.id }], SCHEDULE_RULES, ctx)
    if (!isBlocked(violations)) out.push(t.id)
  }
  return out
}
