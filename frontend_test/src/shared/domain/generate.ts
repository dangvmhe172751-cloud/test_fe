import { addDays, diffDays, weekdayOf } from './time'
import type { ClassGroup, DateStr, ID, Session } from './types'

export interface GenerateInput {
  classGroupId: ID
  startDate: DateStr
  /** số buổi cần sinh; sinh xong buổi cuối sẽ quyết định endDate thực tế */
  totalSessions: number
  weekdays: number[]
  startMin: number
  endMin: number
  teacherId: ID
  roomId: ID
  /** các ngày bỏ qua (lễ) — vẫn sinh tiếp cho đủ số buổi */
  skipDates?: Set<DateStr>
}

const MAX_LOOKAHEAD_DAYS = 366 * 2

/**
 * Materialize mẫu lặp thành danh sách Session cụ thể.
 * Đây là bước bắt buộc trước mọi kiểm tra xung đột — hệ thống không bao giờ
 * so sánh 2 mẫu lặp với nhau.
 */
export function generateSessions(input: GenerateInput): Session[] {
  if (!input.weekdays.length || input.totalSessions <= 0) return []
  const out: Session[] = []
  let cursor = input.startDate
  let guard = 0

  while (out.length < input.totalSessions && guard++ < MAX_LOOKAHEAD_DAYS) {
    if (input.weekdays.includes(weekdayOf(cursor)) && !input.skipDates?.has(cursor)) {
      out.push({
        id: `${input.classGroupId}-s${String(out.length + 1).padStart(2, '0')}`,
        classGroupId: input.classGroupId,
        date: cursor,
        startMin: input.startMin,
        endMin: input.endMin,
        teacherId: input.teacherId,
        roomId: input.roomId,
        status: 'scheduled',
      })
    }
    cursor = addDays(cursor, 1)
  }
  return out
}

export const lastDateOf = (sessions: Session[]): DateStr =>
  sessions.reduce((max, s) => (s.date > max ? s.date : max), sessions[0]?.date ?? '')

export function classFromGenerated(
  base: Omit<ClassGroup, 'endDate'>,
  sessions: Session[],
): ClassGroup {
  return { ...base, endDate: lastDateOf(sessions) || base.startDate }
}

export const spanDays = diffDays
