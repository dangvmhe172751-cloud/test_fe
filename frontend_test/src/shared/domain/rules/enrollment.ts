import { confirmedCount, studentKey } from '../scheduleIndex'
import { fmtDateVi, fmtRange, overlaps, parseDate } from '../time'
import type { ClassGroup, Course, Enrollment, ID, Session, Student } from '../types'
import type { EnrollmentRule, RuleContext, Violation } from './types'

const v = (
  ruleId: string,
  severity: Violation['severity'],
  e: Enrollment,
  message: string,
  extra: Partial<Violation> = {},
): Violation => ({
  ruleId,
  domain: 'enrollment',
  severity,
  message,
  subjectId: e.id,
  ...extra,
})

const classOf = (ctx: RuleContext, id: ID) => ctx.data.classGroups.find((c) => c.id === id)
const courseOf = (ctx: RuleContext, cls?: ClassGroup) =>
  cls && ctx.data.courses.find((c) => c.id === cls.courseId)
const studentOf = (ctx: RuleContext, id: ID) => ctx.data.students.find((s) => s.id === id)

/** Sức chứa thực tế = min(giới hạn khoá, sức chứa phòng mặc định) */
export function effectiveCapacity(ctx: RuleContext, cls: ClassGroup, course?: Course): number {
  const room = ctx.data.rooms.find((r) => r.id === cls.defaultRoomId)
  return Math.min(course?.maxStudents ?? Infinity, room?.capacity ?? Infinity)
}

/** Các buổi còn ở tương lai của lớp — dùng cho E05 và E09 */
export function upcomingSessions(ctx: RuleContext, classId: ID): Session[] {
  const today = ctx.now.slice(0, 10)
  return (ctx.index.byClass.get(classId) ?? [])
    .filter((s) => s.status === 'scheduled' && s.date >= today)
    .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1))
}

/** Đăng ký đang chiếm chỗ hoặc đang giữ chỗ của học viên (loại withdrawn/transferred) */
const activeEnrollments = (ctx: RuleContext, studentId: ID) =>
  (ctx.index.enrollmentsByStudent.get(studentId) ?? []).filter(
    (x) => x.status === 'confirmed' || x.status === 'pending' || x.status === 'waitlisted',
  )

// ------------------------------------------------------------------ E01
export const E01_classNotOpen: EnrollmentRule = {
  id: 'E01',
  domain: 'enrollment',
  severity: 'error',
  label: 'Lớp chưa mở đăng ký',
  check(e, ctx) {
    const cls = classOf(ctx, e.classGroupId)
    if (!cls) return [v('E01', 'error', e, 'Không tìm thấy lớp')]
    if (cls.status === 'published') return []
    const label: Record<ClassGroup['status'], string> = {
      draft: 'còn ở bản nháp, chưa công bố',
      published: '',
      finished: 'đã kết thúc',
      cancelled: 'đã huỷ',
    }
    return [v('E01', 'error', e, `Lớp ${cls.name} ${label[cls.status]}`)]
  },
}

// ------------------------------------------------------------------ E02
export const E02_duplicate: EnrollmentRule = {
  id: 'E02',
  domain: 'enrollment',
  severity: 'error',
  label: 'Đã đăng ký lớp này rồi',
  check(e, ctx) {
    const dup = activeEnrollments(ctx, e.studentId).find(
      (x) => x.id !== e.id && x.classGroupId === e.classGroupId,
    )
    if (!dup) return []
    return [
      v('E02', 'error', e, `Học viên đã có đăng ký lớp này (trạng thái: ${dup.status})`, {
        conflictWith: [dup.id],
      }),
    ]
  },
}

// ------------------------------------------------------------------ E03
export const E03_sameCourseAnotherClass: EnrollmentRule = {
  id: 'E03',
  domain: 'enrollment',
  severity: 'warning',
  label: 'Đang học lớp khác cùng khoá',
  check(e, ctx) {
    const cls = classOf(ctx, e.classGroupId)
    if (!cls) return []
    const conflict = activeEnrollments(ctx, e.studentId)
      .filter((x) => x.id !== e.id && x.classGroupId !== e.classGroupId)
      .find((x) => classOf(ctx, x.classGroupId)?.courseId === cls.courseId)
    if (!conflict) return []
    return [
      v(
        'E03',
        'warning',
        e,
        `Học viên đang theo lớp ${classOf(ctx, conflict.classGroupId)?.name} cùng khoá học này`,
        { conflictWith: [conflict.id] },
      ),
    ]
  },
}

// ------------------------------------------------------------------ E04
export const E04_classFull: EnrollmentRule = {
  id: 'E04',
  domain: 'enrollment',
  severity: 'error',
  label: 'Lớp đã đầy',
  check(e, ctx) {
    if (e.status === 'waitlisted') return []
    const cls = classOf(ctx, e.classGroupId)
    if (!cls) return []
    const cap = effectiveCapacity(ctx, cls, courseOf(ctx, cls))
    const taken = confirmedCount(ctx.index, cls.id)
    if (taken < cap) return []
    const queue = (ctx.index.waitlistByClass.get(cls.id) ?? []).length
    return [
      v('E04', 'error', e, `Lớp ${cls.name} đã đủ ${taken}/${cap} chỗ`, {
        resource: { kind: 'class', id: cls.id },
        suggestion: `Đưa vào hàng chờ (vị trí ${queue + 1})`,
      }),
    ]
  },
}

// ------------------------------------------------------------------ E05
export const E05_scheduleClash: EnrollmentRule = {
  id: 'E05',
  domain: 'enrollment',
  severity: 'error',
  label: 'Lịch lớp trùng lịch cá nhân học viên',
  check(e, ctx) {
    const target = upcomingSessions(ctx, e.classGroupId)
    const out: Violation[] = []
    for (const s of target) {
      const clash = (ctx.index.byStudentDate.get(studentKey(e.studentId, s.date)) ?? []).filter(
        (o) => o.classGroupId !== e.classGroupId && overlaps(o, s),
      )
      if (!clash.length) continue
      out.push(
        v(
          'E05',
          'error',
          e,
          `Buổi ${fmtDateVi(s.date)} ${fmtRange(s)} trùng lớp ${
            classOf(ctx, clash[0].classGroupId)?.name
          } của học viên`,
          { conflictWith: clash.map((c) => c.id), resource: { kind: 'student', id: e.studentId } },
        ),
      )
      if (out.length >= 3) break // đủ để người dùng hiểu, không đổ hàng chục dòng
    }
    return out
  },
}

// ------------------------------------------------------------------ E06
export const E06_prerequisite: EnrollmentRule = {
  id: 'E06',
  domain: 'enrollment',
  severity: 'error',
  label: 'Chưa hoàn thành khoá tiên quyết',
  check(e, ctx) {
    const course = courseOf(ctx, classOf(ctx, e.classGroupId))
    if (!course?.prerequisiteCourseIds.length) return []
    const finishedCourseIds = new Set(
      (ctx.index.enrollmentsByStudent.get(e.studentId) ?? [])
        .filter((x) => x.status === 'confirmed')
        .map((x) => classOf(ctx, x.classGroupId))
        .filter((c) => c?.status === 'finished')
        .map((c) => c!.courseId),
    )
    const missing = course.prerequisiteCourseIds.filter((id) => !finishedCourseIds.has(id))
    if (!missing.length) return []
    const names = missing.map((id) => ctx.data.courses.find((c) => c.id === id)?.name ?? id)
    return [v('E06', 'error', e, `Chưa hoàn thành khoá tiên quyết: ${names.join(', ')}`)]
  },
}

// ------------------------------------------------------------------ E07
export const E07_ageOrLevel: EnrollmentRule = {
  id: 'E07',
  domain: 'enrollment',
  severity: 'warning',
  label: 'Tuổi / trình độ đầu vào không đạt',
  check(e, ctx) {
    const course = courseOf(ctx, classOf(ctx, e.classGroupId))
    const st = studentOf(ctx, e.studentId)
    if (!course || !st) return []
    const out: Violation[] = []
    if (course.minAge != null) {
      const age = Math.floor(
        (parseDate(ctx.now.slice(0, 10)).getTime() - parseDate(st.dob).getTime()) /
          (365.25 * 86_400_000),
      )
      if (age < course.minAge) {
        out.push(v('E07', 'warning', e, `Học viên ${age} tuổi, khoá yêu cầu từ ${course.minAge}`))
      }
    }
    if (course.requiredLevel && st.level !== course.requiredLevel) {
      out.push(
        v(
          'E07',
          'warning',
          e,
          `Trình độ hiện tại "${st.level ?? 'chưa xếp'}" khác yêu cầu "${course.requiredLevel}"`,
        ),
      )
    }
    return out
  },
}

// ------------------------------------------------------------------ E08
export const E08_studentNotActive: EnrollmentRule = {
  id: 'E08',
  domain: 'enrollment',
  severity: 'error',
  label: 'Trạng thái học viên không hợp lệ',
  check(e, ctx) {
    const st = studentOf(ctx, e.studentId)
    if (!st) return [v('E08', 'error', e, 'Không tìm thấy học viên')]
    if (st.status === 'active') return []
    const label: Record<Exclude<Student['status'], 'active'>, string> = {
      paused: 'đang tạm dừng học',
      debt: 'đang nợ học phí',
      graduated: 'đã tốt nghiệp',
    }
    return [v('E08', 'error', e, `Học viên ${st.fullName} ${label[st.status]}`)]
  },
}

// ------------------------------------------------------------------ E09
export const E09_lateJoin: EnrollmentRule = {
  id: 'E09',
  domain: 'enrollment',
  severity: 'warning',
  label: 'Đăng ký trễ sau khai giảng',
  check(e, ctx) {
    const cls = classOf(ctx, e.classGroupId)
    if (!cls) return []
    const today = ctx.now.slice(0, 10)
    if (today <= cls.startDate) return []
    const passed = (ctx.index.byClass.get(cls.id) ?? []).filter(
      (s) => s.date < today && s.status !== 'cancelled',
    ).length
    const max = ctx.data.settings.lateJoinMaxSessions
    if (passed === 0) return []
    if (passed > max) {
      return [
        v('E09', 'warning', e, `Lớp đã học ${passed} buổi, vượt mức cho phép vào trễ (${max} buổi)`),
      ]
    }
    return [v('E09', 'warning', e, `Lớp đã học ${passed} buổi, học viên vào trễ`)]
  },
}

// ------------------------------------------------------------------ E10
export const E10_paymentHold: EnrollmentRule = {
  id: 'E10',
  domain: 'enrollment',
  severity: 'info',
  label: 'Giữ chỗ chờ xác nhận học phí',
  check(e, ctx) {
    if (e.status !== 'pending') return []
    const hours = ctx.data.settings.enrollmentHoldHours
    if (e.holdExpiresAt && e.holdExpiresAt < ctx.now) {
      return [
        v('E10', 'warning', e, `Đã quá hạn giữ chỗ (${e.holdExpiresAt}), cần huỷ hoặc gia hạn`),
      ]
    }
    return [v('E10', 'info', e, `Giữ chỗ ${hours}h chờ xác nhận học phí, chưa tính vào sĩ số`)]
  },
}

// ------------------------------------------------------------------ E11
export const E11_transferTarget: EnrollmentRule = {
  id: 'E11',
  domain: 'enrollment',
  severity: 'error',
  label: 'Chuyển lớp: lớp đích không hợp lệ',
  check(e, ctx) {
    // Luật này được engine gọi trên bản ghi đăng ký ở lớp ĐÍCH.
    // Nếu lớp đích không qua được E01/E04/E05 thì tuyệt đối không rút lớp nguồn.
    const blockers = [E01_classNotOpen, E04_classFull, E05_scheduleClash]
      .flatMap((r) => r.check(e, ctx))
      .filter((x) => x.severity === 'error')
    if (!blockers.length) return []
    return [
      v(
        'E11',
        'error',
        e,
        `Không thể chuyển lớp: ${blockers.map((b) => `[${b.ruleId}] ${b.message}`).join(' · ')}`,
      ),
    ]
  },
}

// ------------------------------------------------------------------ E12
export const E12_lateWithdraw: EnrollmentRule = {
  id: 'E12',
  domain: 'enrollment',
  severity: 'warning',
  label: 'Rút lớp muộn',
  check(e, ctx) {
    if (e.status !== 'withdrawn') return []
    const all = (ctx.index.byClass.get(e.classGroupId) ?? []).filter((s) => s.status !== 'cancelled')
    if (!all.length) return []
    const today = ctx.now.slice(0, 10)
    const done = all.filter((s) => s.date < today).length
    const pct = Math.round((done / all.length) * 100)
    if (pct < ctx.data.settings.withdrawWarnPercent) return []
    return [
      v('E12', 'warning', e, `Rút lớp khi đã học ${pct}% số buổi (${done}/${all.length})`, {
        suggestion: 'Cần duyệt của quản lý học vụ và xử lý hoàn phí',
      }),
    ]
  },
}

// ------------------------------------------------------------------ E13
export const E13_waitlistPromotable: EnrollmentRule = {
  id: 'E13',
  domain: 'enrollment',
  severity: 'info',
  label: 'Hàng chờ có thể được nhận',
  check(e, ctx) {
    if (e.status !== 'waitlisted') return []
    const cls = classOf(ctx, e.classGroupId)
    if (!cls) return []
    const cap = effectiveCapacity(ctx, cls, courseOf(ctx, cls))
    const taken = confirmedCount(ctx.index, cls.id)
    if (taken >= cap) return []
    return [
      v('E13', 'info', e, `Lớp còn ${cap - taken} chỗ — có thể chuyển hàng chờ thành chính thức`, {
        suggestion: 'Chạy lại E04 và E05 trước khi xác nhận',
      }),
    ]
  },
}

export const ENROLLMENT_RULES: EnrollmentRule[] = [
  E01_classNotOpen,
  E02_duplicate,
  E03_sameCourseAnotherClass,
  E04_classFull,
  E05_scheduleClash,
  E06_prerequisite,
  E07_ageOrLevel,
  E08_studentNotActive,
  E09_lateJoin,
  E10_paymentHold,
  E12_lateWithdraw,
  E13_waitlistPromotable,
]

/** Chỉ chạy khi thao tác là "chuyển lớp" — không nằm trong bộ mặc định */
export const TRANSFER_RULES: EnrollmentRule[] = [E11_transferTarget]
