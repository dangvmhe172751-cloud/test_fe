import type { Enrollment, ID, MasterData, Session } from './types'

/**
 * Index theo `${kind}:${resourceId}|${date}` → kiểm tra 1 buổi chỉ phải duyệt
 * các buổi cùng tài nguyên cùng ngày, thay vì quét toàn bộ hệ thống.
 */
export interface ScheduleIndex {
  byRoomDate: Map<string, Session[]>
  byTeacherDate: Map<string, Session[]>
  byStudentDate: Map<string, Session[]>
  byClass: Map<ID, Session[]>
  byId: Map<ID, Session>
  /** enrollment đang chiếm chỗ (confirmed) theo lớp */
  confirmedByClass: Map<ID, Enrollment[]>
  waitlistByClass: Map<ID, Enrollment[]>
  enrollmentsByStudent: Map<ID, Enrollment[]>
}

const push = <T,>(map: Map<string, T[]>, key: string, value: T) => {
  const arr = map.get(key)
  if (arr) arr.push(value)
  else map.set(key, [value])
}

export const roomKey = (roomId: ID, date: string) => `room:${roomId}|${date}`
export const teacherKey = (teacherId: ID, date: string) => `teacher:${teacherId}|${date}`
export const studentKey = (studentId: ID, date: string) => `student:${studentId}|${date}`

/** Buổi đã huỷ không chiếm tài nguyên → loại khỏi index */
const occupies = (s: Session) => s.status !== 'cancelled'

export function buildScheduleIndex(data: MasterData): ScheduleIndex {
  const index: ScheduleIndex = {
    byRoomDate: new Map(),
    byTeacherDate: new Map(),
    byStudentDate: new Map(),
    byClass: new Map(),
    byId: new Map(),
    confirmedByClass: new Map(),
    waitlistByClass: new Map(),
    enrollmentsByStudent: new Map(),
  }

  for (const e of data.enrollments) {
    push(index.enrollmentsByStudent, e.studentId, e)
    if (e.status === 'confirmed') push(index.confirmedByClass, e.classGroupId, e)
    if (e.status === 'waitlisted') push(index.waitlistByClass, e.classGroupId, e)
  }
  for (const list of index.waitlistByClass.values()) {
    list.sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0))
  }

  // studentId -> các lớp đang giữ chỗ, để dựng lịch cá nhân học viên
  const classStudents = new Map<ID, ID[]>()
  for (const e of data.enrollments) {
    if (e.status === 'confirmed' || e.status === 'pending') {
      push(classStudents, e.classGroupId, e.studentId)
    }
  }

  for (const s of data.sessions) {
    index.byId.set(s.id, s)
    push(index.byClass, s.classGroupId, s)
    if (!occupies(s)) continue
    push(index.byRoomDate, roomKey(s.roomId, s.date), s)
    push(index.byTeacherDate, teacherKey(s.teacherId, s.date), s)
    for (const studentId of classStudents.get(s.classGroupId) ?? []) {
      push(index.byStudentDate, studentKey(studentId, s.date), s)
    }
  }

  return index
}

export const sessionsInRoom = (i: ScheduleIndex, roomId: ID, date: string) =>
  i.byRoomDate.get(roomKey(roomId, date)) ?? []
export const sessionsOfTeacher = (i: ScheduleIndex, teacherId: ID, date: string) =>
  i.byTeacherDate.get(teacherKey(teacherId, date)) ?? []
export const sessionsOfStudent = (i: ScheduleIndex, studentId: ID, date: string) =>
  i.byStudentDate.get(studentKey(studentId, date)) ?? []
export const confirmedCount = (i: ScheduleIndex, classId: ID) =>
  (i.confirmedByClass.get(classId) ?? []).length
