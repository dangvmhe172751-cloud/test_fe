import type { DateStr, Minute, TimeRange, Weekday } from './types'

/**
 * Test overlap DUY NHẤT của toàn hệ thống. Khoảng nửa mở [start, end):
 * 8:00-10:00 và 10:00-12:00 KHÔNG trùng nhau.
 */
export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin
}

/** Overlap có tính thêm khoảng nghỉ tối thiểu giữa 2 buổi (R12) */
export function overlapsWithBuffer(a: TimeRange, b: TimeRange, bufferMin: number): boolean {
  return a.startMin - bufferMin < b.endMin && b.startMin - bufferMin < a.endMin
}

export function minutesOverlapped(a: TimeRange, b: TimeRange): number {
  return Math.max(0, Math.min(a.endMin, b.endMin) - Math.max(a.startMin, b.startMin))
}

/** 'a' nằm trọn trong 'b' */
export function contains(outer: TimeRange, inner: TimeRange): boolean {
  return outer.startMin <= inner.startMin && inner.endMin <= outer.endMin
}

export function toMin(hhmm: string): Minute {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

export function fmtMin(min: Minute): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function fmtRange(r: TimeRange): string {
  return `${fmtMin(r.startMin)}–${fmtMin(r.endMin)}`
}

/** So sánh chuỗi 'YYYY-MM-DD' là so sánh đúng thứ tự thời gian → không cần parse Date */
export function dateInSpan(date: DateStr, from: DateStr, to: DateStr): boolean {
  return date >= from && date <= to
}

const DAY_MS = 86_400_000

export function parseDate(date: DateStr): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function toDateStr(d: Date): DateStr {
  return d.toISOString().slice(0, 10)
}

export function addDays(date: DateStr, days: number): DateStr {
  return toDateStr(new Date(parseDate(date).getTime() + days * DAY_MS))
}

export function diffDays(from: DateStr, to: DateStr): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / DAY_MS)
}

export function weekdayOf(date: DateStr): Weekday {
  return parseDate(date).getUTCDay() as Weekday
}

/** Thứ 2 của tuần chứa `date` */
export function startOfWeek(date: DateStr): DateStr {
  const wd = weekdayOf(date)
  return addDays(date, wd === 0 ? -6 : 1 - wd)
}

export function weekDates(anchor: DateStr): DateStr[] {
  const mon = startOfWeek(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
}

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  0: 'CN', 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7',
}

export function fmtDateVi(date: DateStr): string {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

export function todayStr(): DateStr {
  const now = new Date()
  return toDateStr(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
}

export function hoursOf(r: TimeRange): number {
  return (r.endMin - r.startMin) / 60
}
