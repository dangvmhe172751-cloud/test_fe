import { confirmedCount, sessionsInRoom, sessionsOfTeacher, studentKey } from '../scheduleIndex'
import {
  addDays,
  contains,
  dateInSpan,
  fmtRange,
  hoursOf,
  overlaps,
  overlapsWithBuffer,
  startOfWeek,
  weekdayOf,
} from '../time'
import type { ID, Session, TimeRange, WeeklyAvailability } from '../types'
import type { RuleContext, SessionRule, Violation } from './types'

/** Bỏ qua chính buổi đang sửa để nó không tự xung đột với bản cũ của mình */
const other = (ctx: RuleContext, s: Session) => (o: Session) =>
  o.id !== s.id && !ctx.ignoreIds.has(o.id)

const v = (
  ruleId: string,
  severity: Violation['severity'],
  s: Session,
  message: string,
  extra: Partial<Violation> = {},
): Violation => ({
  ruleId,
  domain: 'schedule',
  severity,
  message,
  subjectId: s.id,
  ...extra,
})

const classLabel = (ctx: RuleContext, classGroupId: ID) =>
  ctx.data.classGroups.find((c) => c.id === classGroupId)?.name ?? classGroupId

const availabilityOn = (list: WeeklyAvailability[], date: string): TimeRange[] =>
  list.filter((a) => a.weekday === weekdayOf(date))

const fitsAvailability = (list: WeeklyAvailability[], s: Session) =>
  availabilityOn(list, s.date).some((a) => contains(a, s))

// ------------------------------------------------------------------ R01
export const R01_roomDoubleBooked: SessionRule = {
  id: 'R01',
  domain: 'schedule',
  severity: 'error',
  label: 'Phòng bị đặt trùng giờ',
  check(s, ctx) {
    if (s.status === 'cancelled') return []
    const clash = sessionsInRoom(ctx.index, s.roomId, s.date)
      .filter(other(ctx, s))
      .filter((o) => overlaps(o, s))
    if (!clash.length) return []
    const room = ctx.data.rooms.find((r) => r.id === s.roomId)
    return [
      v(
        'R01',
        'error',
        s,
        `Phòng ${room?.name ?? s.roomId} đã có lớp ${clash
          .map((c) => classLabel(ctx, c.classGroupId))
          .join(', ')} lúc ${clash.map(fmtRange).join(', ')}`,
        {
          conflictWith: clash.map((c) => c.id),
          resource: { kind: 'room', id: s.roomId },
        },
      ),
    ]
  },
}

// ------------------------------------------------------------------ R02
export const R02_teacherDoubleBooked: SessionRule = {
  id: 'R02',
  domain: 'schedule',
  severity: 'error',
  label: 'Giáo viên dạy 2 lớp trùng giờ',
  check(s, ctx) {
    if (s.status === 'cancelled') return []
    const clash = sessionsOfTeacher(ctx.index, s.teacherId, s.date)
      .filter(other(ctx, s))
      .filter((o) => overlaps(o, s))
    if (!clash.length) return []
    const t = ctx.data.teachers.find((x) => x.id === s.teacherId)
    return [
      v(
        'R02',
        'error',
        s,
        `GV ${t?.fullName ?? s.teacherId} đang dạy lớp ${clash
          .map((c) => classLabel(ctx, c.classGroupId))
          .join(', ')} lúc ${clash.map(fmtRange).join(', ')}`,
        {
          conflictWith: clash.map((c) => c.id),
          resource: { kind: 'teacher', id: s.teacherId },
        },
      ),
    ]
  },
}

// ------------------------------------------------------------------ R03
export const R03_studentDoubleBooked: SessionRule = {
  id: 'R03',
  domain: 'schedule',
  severity: 'error',
  label: 'Học viên có 2 buổi trùng giờ',
  check(s, ctx) {
    if (s.status === 'cancelled') return []
    const students = (ctx.index.confirmedByClass.get(s.classGroupId) ?? []).map(
      (e) => e.studentId,
    )
    const out: Violation[] = []
    for (const studentId of students) {
      const clash = (ctx.index.byStudentDate.get(studentKey(studentId, s.date)) ?? [])
        .filter(other(ctx, s))
        .filter((o) => o.classGroupId !== s.classGroupId && overlaps(o, s))
      if (!clash.length) continue
      const st = ctx.data.students.find((x) => x.id === studentId)
      out.push(
        v(
          'R03',
          'error',
          s,
          `HV ${st?.fullName ?? studentId} đã có buổi lớp ${classLabel(
            ctx,
            clash[0].classGroupId,
          )} lúc ${fmtRange(clash[0])}`,
          {
            conflictWith: clash.map((c) => c.id),
            resource: { kind: 'student', id: studentId },
          },
        ),
      )
    }
    return out
  },
}

// ------------------------------------------------------------------ R04
export const R04_roomCapacity: SessionRule = {
  id: 'R04',
  domain: 'schedule',
  severity: 'error',
  label: 'Sĩ số vượt sức chứa phòng',
  check(s, ctx) {
    const room = ctx.data.rooms.find((r) => r.id === s.roomId)
    if (!room) return []
    const n = confirmedCount(ctx.index, s.classGroupId)
    if (n <= room.capacity) return []
    return [
      v(
        'R04',
        'error',
        s,
        `Lớp ${classLabel(ctx, s.classGroupId)} có ${n} HV, vượt sức chứa phòng ${room.name} (${room.capacity})`,
        { resource: { kind: 'room', id: room.id } },
      ),
    ]
  },
}

// ------------------------------------------------------------------ R05
export const R05_outsideCenterHours: SessionRule = {
  id: 'R05',
  domain: 'schedule',
  severity: 'error',
  label: 'Ngoài giờ mở cửa',
  check(s, ctx) {
    if (!fitsAvailability(ctx.data.settings.openHours, s)) {
      return [v('R05', 'error', s, `Buổi ${fmtRange(s)} nằm ngoài giờ mở cửa của trung tâm`)]
    }
    const room = ctx.data.rooms.find((r) => r.id === s.roomId)
    if (room && room.openHours.length && !fitsAvailability(room.openHours, s)) {
      return [
        v('R05', 'error', s, `Buổi ${fmtRange(s)} nằm ngoài giờ mở của phòng ${room.name}`, {
          resource: { kind: 'room', id: room.id },
        }),
      ]
    }
    return []
  },
}

// ------------------------------------------------------------------ R06
export const R06_holidayOrMaintenance: SessionRule = {
  id: 'R06',
  domain: 'schedule',
  severity: 'error',
  label: 'Trùng ngày lễ / phòng bảo trì',
  check(s, ctx) {
    const out: Violation[] = []
    const holiday = ctx.data.holidays.find((h) => dateInSpan(s.date, h.from, h.to))
    if (holiday) out.push(v('R06', 'error', s, `Trùng ngày nghỉ: ${holiday.name}`))

    const room = ctx.data.rooms.find((r) => r.id === s.roomId)
    if (room) {
      if (room.status === 'maintenance') {
        out.push(
          v('R06', 'error', s, `Phòng ${room.name} đang bảo trì`, {
            resource: { kind: 'room', id: room.id },
          }),
        )
      }
      const blk = room.blackouts.find((b) => dateInSpan(s.date, b.from, b.to))
      if (blk) {
        out.push(
          v('R06', 'error', s, `Phòng ${room.name} không dùng được: ${blk.reason}`, {
            resource: { kind: 'room', id: room.id },
          }),
        )
      }
    }
    return out
  },
}

// ------------------------------------------------------------------ R07
export const R07_teacherUnavailable: SessionRule = {
  id: 'R07',
  domain: 'schedule',
  severity: 'error',
  label: 'GV ngoài giờ rảnh / đang nghỉ phép',
  check(s, ctx) {
    const t = ctx.data.teachers.find((x) => x.id === s.teacherId)
    if (!t) return []
    const out: Violation[] = []
    const leave = t.leaves.find((l) => dateInSpan(s.date, l.from, l.to))
    if (leave) {
      out.push(
        v('R07', 'error', s, `GV ${t.fullName} nghỉ phép (${leave.reason})`, {
          resource: { kind: 'teacher', id: t.id },
        }),
      )
    }
    if (t.availability.length && !fitsAvailability(t.availability, s)) {
      out.push(
        v('R07', 'error', s, `GV ${t.fullName} không đăng ký rảnh khung ${fmtRange(s)}`, {
          resource: { kind: 'teacher', id: t.id },
        }),
      )
    }
    if (t.status !== 'active') {
      out.push(
        v('R07', 'error', s, `GV ${t.fullName} đang ngừng hoạt động`, {
          resource: { kind: 'teacher', id: t.id },
        }),
      )
    }
    return out
  },
}

// ------------------------------------------------------------------ R08
export const R08_teacherSubjectMismatch: SessionRule = {
  id: 'R08',
  domain: 'schedule',
  severity: 'warning',
  label: 'GV không đúng chuyên môn',
  check(s, ctx) {
    const cls = ctx.data.classGroups.find((c) => c.id === s.classGroupId)
    const course = ctx.data.courses.find((c) => c.id === cls?.courseId)
    const t = ctx.data.teachers.find((x) => x.id === s.teacherId)
    if (!course || !t || t.subjectIds.includes(course.subjectId)) return []
    const subject = ctx.data.subjects.find((x) => x.id === course.subjectId)
    return [
      v(
        'R08',
        'warning',
        s,
        `GV ${t.fullName} chưa khai chuyên môn "${subject?.name ?? course.subjectId}"`,
        { resource: { kind: 'teacher', id: t.id } },
      ),
    ]
  },
}

// ------------------------------------------------------------------ R09
export const R09_outsideClassRange: SessionRule = {
  id: 'R09',
  domain: 'schedule',
  severity: 'error',
  label: 'Buổi ngoài khoảng ngày của lớp',
  check(s, ctx) {
    const cls = ctx.data.classGroups.find((c) => c.id === s.classGroupId)
    if (!cls || dateInSpan(s.date, cls.startDate, cls.endDate)) return []
    return [
      v(
        'R09',
        'error',
        s,
        `Buổi ${s.date} nằm ngoài khoảng ${cls.startDate} → ${cls.endDate} của lớp ${cls.name}`,
        { resource: { kind: 'class', id: cls.id } },
      ),
    ]
  },
}

// ------------------------------------------------------------------ R10
export const R10_missingEquipment: SessionRule = {
  id: 'R10',
  domain: 'schedule',
  severity: 'warning',
  label: 'Phòng thiếu thiết bị',
  check(s, ctx) {
    const cls = ctx.data.classGroups.find((c) => c.id === s.classGroupId)
    const course = ctx.data.courses.find((c) => c.id === cls?.courseId)
    const room = ctx.data.rooms.find((r) => r.id === s.roomId)
    if (!course || !room) return []
    const missing = course.requiredEquipment.filter((e) => !room.equipment.includes(e))
    if (!missing.length) return []
    return [
      v('R10', 'warning', s, `Phòng ${room.name} thiếu: ${missing.join(', ')}`, {
        resource: { kind: 'room', id: room.id },
      }),
    ]
  },
}

// ------------------------------------------------------------------ R11
export const R11_teacherOverload: SessionRule = {
  id: 'R11',
  domain: 'schedule',
  severity: 'warning',
  label: 'GV vượt tải tuần',
  check(s, ctx) {
    const t = ctx.data.teachers.find((x) => x.id === s.teacherId)
    if (!t || s.status === 'cancelled') return []
    const monday = startOfWeek(s.date)
    let hours = hoursOf(s)
    for (let i = 0; i < 7; i++) {
      for (const o of sessionsOfTeacher(ctx.index, t.id, addDays(monday, i))) {
        if (o.id === s.id || ctx.ignoreIds.has(o.id)) continue
        hours += hoursOf(o)
      }
    }
    if (hours <= t.maxHoursPerWeek) return []
    return [
      v(
        'R11',
        'warning',
        s,
        `GV ${t.fullName} dạy ${hours.toFixed(1)}h trong tuần ${monday}, vượt mức ${t.maxHoursPerWeek}h`,
        { resource: { kind: 'teacher', id: t.id } },
      ),
    ]
  },
}

// ------------------------------------------------------------------ R12
export const R12_missingBuffer: SessionRule = {
  id: 'R12',
  domain: 'schedule',
  severity: 'warning',
  label: 'Không đủ nghỉ giữa 2 buổi',
  check(s, ctx) {
    const buffer = ctx.data.settings.bufferMin
    if (buffer <= 0 || s.status === 'cancelled') return []
    const near = [
      ...sessionsOfTeacher(ctx.index, s.teacherId, s.date),
      ...sessionsInRoom(ctx.index, s.roomId, s.date),
    ]
      .filter(other(ctx, s))
      .filter((o) => !overlaps(o, s) && overlapsWithBuffer(o, s, buffer))
    if (!near.length) return []
    return [
      v(
        'R12',
        'warning',
        s,
        `Cách buổi liền kề (${near.map(fmtRange).join(', ')}) dưới ${buffer} phút`,
        { conflictWith: near.map((n) => n.id) },
      ),
    ]
  },
}

// ------------------------------------------------------------------ R13
export const R13_editPastSession: SessionRule = {
  id: 'R13',
  domain: 'schedule',
  severity: 'error',
  label: 'Sửa buổi đã diễn ra',
  check(s, ctx) {
    const original = ctx.index.byId.get(s.id)
    if (!original || original.status !== 'done') return []
    const changed =
      original.date !== s.date ||
      original.startMin !== s.startMin ||
      original.endMin !== s.endMin ||
      original.roomId !== s.roomId ||
      original.teacherId !== s.teacherId
    if (!changed) return []
    return [v('R13', 'error', s, 'Buổi học đã diễn ra, không được sửa lịch')]
  },
}

// ------------------------------------------------------------------ R14
export const R14_publishedClassChanged: SessionRule = {
  id: 'R14',
  domain: 'schedule',
  severity: 'info',
  label: 'Lớp đã công bố bị đổi lịch',
  check(s, ctx) {
    const cls = ctx.data.classGroups.find((c) => c.id === s.classGroupId)
    if (cls?.status !== 'published') return []
    const original = ctx.index.byId.get(s.id)
    if (!original) return []
    const changed =
      original.date !== s.date ||
      original.startMin !== s.startMin ||
      original.roomId !== s.roomId ||
      original.teacherId !== s.teacherId
    if (!changed) return []
    return [
      v(
        'R14',
        'info',
        s,
        `Lớp đã công bố — cần thông báo cho ${confirmedCount(ctx.index, cls.id)} học viên về thay đổi lịch`,
        { resource: { kind: 'class', id: cls.id } },
      ),
    ]
  },
}

export const SCHEDULE_RULES: SessionRule[] = [
  R01_roomDoubleBooked,
  R02_teacherDoubleBooked,
  R03_studentDoubleBooked,
  R04_roomCapacity,
  R05_outsideCenterHours,
  R06_holidayOrMaintenance,
  R07_teacherUnavailable,
  R08_teacherSubjectMismatch,
  R09_outsideClassRange,
  R10_missingEquipment,
  R11_teacherOverload,
  R12_missingBuffer,
  R13_editPastSession,
  R14_publishedClassChanged,
]
