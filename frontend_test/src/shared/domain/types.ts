/**
 * Data model lõi. Quy ước xuyên suốt hệ thống:
 * - Thời gian trong ngày là số nguyên phút tính từ 00:00 (Minute), KHÔNG dùng Date để so sánh.
 * - Mọi khoảng thời gian là nửa mở [startMin, endMin) → 8:00-10:00 và 10:00-12:00 không trùng.
 * - Session là nguồn sự thật của lịch; Enrollment là nguồn sự thật của sĩ số.
 */

export type ID = string
/** 'YYYY-MM-DD' */
export type DateStr = string
/** Số phút tính từ 00:00, 0..1440 */
export type Minute = number
/** 0 = Chủ nhật ... 6 = Thứ bảy (khớp Date#getDay) */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface TimeRange {
  startMin: Minute
  endMin: Minute
}

export interface Slot extends TimeRange {
  date: DateStr
}

export interface WeeklyAvailability extends TimeRange {
  weekday: Weekday
}

export interface DateSpan {
  from: DateStr
  to: DateStr
  reason: string
}

export type Role = 'admin' | 'academic' | 'teacher' | 'student'

export interface User {
  id: ID
  username: string
  fullName: string
  role: Role
  /** trỏ tới teachers.id hoặc students.id tuỳ role */
  linkedId?: ID
}

export interface Subject {
  id: ID
  code: string
  name: string
}

export interface Teacher {
  id: ID
  code: string
  fullName: string
  email: string
  phone: string
  subjectIds: ID[]
  availability: WeeklyAvailability[]
  leaves: DateSpan[]
  maxHoursPerWeek: number
  status: 'active' | 'inactive'
}

export interface Student {
  id: ID
  code: string
  fullName: string
  dob: DateStr
  level?: string
  guardian: { name: string; phone: string }
  status: 'active' | 'paused' | 'debt' | 'graduated'
}

export interface Room {
  id: ID
  name: string
  capacity: number
  equipment: string[]
  openHours: WeeklyAvailability[]
  blackouts: DateSpan[]
  status: 'available' | 'maintenance'
}

export interface Course {
  id: ID
  code: string
  name: string
  subjectId: ID
  totalSessions: number
  sessionDurationMin: number
  requiredEquipment: string[]
  maxStudents: number
  prerequisiteCourseIds: ID[]
  minAge?: number
  requiredLevel?: string
  tuition: number
}

export interface RecurrencePattern {
  weekdays: Weekday[]
  startMin: Minute
  endMin: Minute
}

export interface ClassGroup {
  id: ID
  courseId: ID
  name: string
  startDate: DateStr
  endDate: DateStr
  primaryTeacherId: ID
  defaultRoomId: ID
  pattern: RecurrencePattern
  status: 'draft' | 'published' | 'finished' | 'cancelled'
}

export interface Session {
  id: ID
  classGroupId: ID
  date: DateStr
  startMin: Minute
  endMin: Minute
  /** override được từng buổi → dạy thay / đổi phòng 1 buổi không cần hack */
  teacherId: ID
  roomId: ID
  status: 'scheduled' | 'done' | 'cancelled'
  note?: string
}

export type EnrollmentStatus =
  | 'pending'
  | 'confirmed'
  | 'waitlisted'
  | 'withdrawn'
  | 'transferred'

export interface Enrollment {
  id: ID
  studentId: ID
  classGroupId: ID
  status: EnrollmentStatus
  waitlistPosition?: number
  /** ISO datetime — hạn giữ chỗ khi chưa xác nhận học phí (E10) */
  holdExpiresAt?: string
  createdAt: string
  confirmedAt?: string
}

export interface Attendance {
  id: ID
  sessionId: ID
  studentId: ID
  status: 'present' | 'absent' | 'late' | 'excused'
  note?: string
}

export interface Holiday {
  id: ID
  from: DateStr
  to: DateStr
  name: string
}

export interface CenterSettings {
  name: string
  openHours: WeeklyAvailability[]
  /** phút nghỉ tối thiểu giữa 2 buổi của cùng GV / cùng phòng (R12) */
  bufferMin: number
  /** hạn giữ chỗ khi đăng ký chưa xác nhận học phí, tính bằng giờ (E10) */
  enrollmentHoldHours: number
  /** cho phép vào lớp trễ tối đa bao nhiêu buổi (E09) */
  lateJoinMaxSessions: number
  /** rút lớp sau bao nhiêu % số buổi thì cảnh báo (E12) */
  withdrawWarnPercent: number
}

export interface ExportLog {
  id: ID
  at: string
  actorId: ID
  report: string
  rowCount: number
  filters: string
}

export interface AppNotification {
  id: ID
  at: string
  audience: { kind: 'student' | 'teacher'; id: ID }
  message: string
  read: boolean
}

/** Toàn bộ dữ liệu — ở giai đoạn FE mock đây chính là "database" */
export interface MasterData {
  users: User[]
  subjects: Subject[]
  teachers: Teacher[]
  students: Student[]
  rooms: Room[]
  courses: Course[]
  classGroups: ClassGroup[]
  sessions: Session[]
  enrollments: Enrollment[]
  attendances: Attendance[]
  holidays: Holiday[]
  settings: CenterSettings
  exportLogs: ExportLog[]
  notifications: AppNotification[]
}
