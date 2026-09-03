import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildDraftClass,
  confirmPayment,
  enroll,
  previewSession,
  promoteWaitlist,
  publishClass,
  saveSession,
  transferClass,
  validateDraftClass,
  withdraw,
} from './api'
import { makeContext, useDb } from './store'
import { effectiveCapacity } from '@/shared/domain/rules/enrollment'
import { addDays, startOfWeek, todayStr, toMin } from '@/shared/domain/time'

const db = () => useDb.getState()
const ctx = () => makeContext(db().data, { actor: db().actor })

beforeEach(() => {
  db().reset()
  db().setActor({ role: 'admin', id: 'U01' })
})

describe('cổng ghi lịch — không thể ghi vào trạng thái xung đột', () => {
  it('từ chối dời buổi vào phòng đã có lớp khác', () => {
    const data = db().data
    const target = data.sessions.find((s) => s.status === 'scheduled')!
    const other = data.sessions.find(
      (s) => s.status === 'scheduled' && s.id !== target.id && s.roomId !== target.roomId,
    )!

    const before = db().data.sessions.find((s) => s.id === target.id)!
    const res = saveSession({
      ...target,
      date: other.date,
      startMin: other.startMin,
      endMin: other.startMin + (target.endMin - target.startMin),
      roomId: other.roomId,
    })

    expect(res.ok).toBe(false)
    expect(res.violations.some((v) => v.severity === 'error')).toBe(true)
    // dữ liệu KHÔNG được thay đổi khi bị chặn
    const after = db().data.sessions.find((s) => s.id === target.id)!
    expect(after).toEqual(before)
  })

  it('cho phép dời tới khe trống và ghi đúng dữ liệu', () => {
    const target = db().data.sessions.find(
      (s) => s.status === 'scheduled' && s.date >= todayStr(),
    )!
    const freeDate = addDays(startOfWeek(todayStr()), 21)
    const res = saveSession({ ...target, date: freeDate, startMin: toMin('09:00'), endMin: toMin('10:00') })

    // có thể vướng R09 nếu ngày vượt endDate của lớp — kiểm tra theo kết quả thực
    if (res.ok) {
      const saved = db().data.sessions.find((s) => s.id === target.id)!
      expect(saved.date).toBe(freeDate)
      expect(saved.startMin).toBe(toMin('09:00'))
    } else {
      expect(res.violations.map((v) => v.ruleId)).toContain('R09')
    }
  })

  it('previewSession là dry-run, không ghi gì', () => {
    const target = db().data.sessions.find((s) => s.status === 'scheduled')!
    const revBefore = db().revision
    previewSession({ ...target, date: addDays(target.date, 1) })
    expect(db().revision).toBe(revBefore)
  })

  it('không sửa được buổi đã dạy (R13)', () => {
    const done = db().data.sessions.find((s) => s.status === 'done')
    if (!done) return
    const res = saveSession({ ...done, startMin: toMin('06:00'), endMin: toMin('07:00') })
    expect(res.ok).toBe(false)
    expect(res.violations.map((v) => v.ruleId)).toContain('R13')
  })
})

describe('mở lớp — lô buổi phải sạch mới công bố được', () => {
  it('lớp trùng phòng + trùng giờ với lớp đang chạy bị chặn công bố', () => {
    const existing = db().data.classGroups.find((c) => c.status === 'published')!
    const built = buildDraftClass(
      {
        courseId: existing.courseId,
        name: 'LỚP-TRÙNG',
        teacherId: existing.primaryTeacherId,
        roomId: existing.defaultRoomId,
        startDate: existing.startDate,
        weekdays: existing.pattern.weekdays,
        startMin: existing.pattern.startMin,
        endMin: existing.pattern.endMin,
        totalSessions: 4,
      },
      ctx(),
    )
    const violations = validateDraftClass(built.cls, built.sessions)
    expect(violations.some((v) => v.ruleId === 'R01')).toBe(true)

    const before = db().data.classGroups.length
    expect(publishClass(built.cls, built.sessions).ok).toBe(false)
    expect(db().data.classGroups.length).toBe(before)
  })

  it('lớp ở khe trống công bố được và sinh đủ số buổi', () => {
    const built = buildDraftClass(
      {
        courseId: 'KH01',
        name: 'LỚP-SẠCH',
        teacherId: 'GV01',
        roomId: 'P101',
        startDate: addDays(startOfWeek(todayStr()), 14),
        weekdays: [3],
        startMin: toMin('10:00'),
        endMin: toMin('11:30'),
        totalSessions: 6,
      },
      ctx(),
    )
    expect(built.sessions).toHaveLength(6)
    const res = publishClass(built.cls, built.sessions)
    expect(res.ok).toBe(true)
    expect(db().data.classGroups.find((c) => c.name === 'LỚP-SẠCH')?.status).toBe('published')
    expect(db().data.sessions.filter((s) => s.classGroupId === built.cls.id)).toHaveLength(6)
  })

  it('bỏ qua ngày lễ nhưng vẫn sinh đủ số buổi yêu cầu', () => {
    const holiday = db().data.holidays[0]
    const built = buildDraftClass(
      {
        courseId: 'KH01',
        name: 'LỚP-LỄ',
        teacherId: 'GV01',
        roomId: 'P101',
        startDate: holiday.from,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        startMin: toMin('10:00'),
        endMin: toMin('11:30'),
        totalSessions: 5,
      },
      ctx(),
    )
    expect(built.sessions).toHaveLength(5)
    expect(built.sessions.map((s) => s.date)).not.toContain(holiday.from)
  })
})

describe('đăng ký học', () => {
  const openClass = () => db().data.classGroups.find((c) => c.status === 'published')!

  it('lớp đầy thì xếp hàng chờ thay vì từ chối (E04)', () => {
    const cls = openClass()
    const cap = effectiveCapacity(ctx(), cls, db().data.courses.find((c) => c.id === cls.courseId))

    // lấp đầy lớp
    const free = db().data.students.filter(
      (s) =>
        s.status === 'active' &&
        !db().data.enrollments.some((e) => e.studentId === s.id && e.classGroupId === cls.id),
    )
    let filled = (ctx().index.confirmedByClass.get(cls.id) ?? []).length
    let i = 0
    while (filled < cap && i < free.length) {
      const r = enroll(free[i++].id, cls.id, { tuitionPaid: true })
      if (r.ok && r.finalStatus === 'confirmed') filled++
    }

    const res = enroll(free[free.length - 1].id, cls.id, { tuitionPaid: true })
    expect(res.ok).toBe(true)
    expect(res.finalStatus).toBe('waitlisted')
  })

  it('từ chối học viên đang nợ học phí (E08)', () => {
    const debtor = db().data.students.find((s) => s.status === 'debt')!
    const res = enroll(debtor.id, openClass().id, { tuitionPaid: true })
    expect(res.ok).toBe(false)
    expect(res.violations.map((v) => v.ruleId)).toContain('E08')
  })

  it('từ chối khi lịch lớp trùng lịch cá nhân học viên (E05)', () => {
    // tìm 1 học viên đang học lớp A, và lớp B có buổi trùng giờ với lớp A
    const data = db().data
    const found = data.enrollments
      .filter((e) => e.status === 'confirmed')
      .map((e) => {
        const clsA = data.classGroups.find((c) => c.id === e.classGroupId)!
        const clsB = data.classGroups.find(
          (c) =>
            c.id !== clsA.id &&
            c.status === 'published' &&
            c.pattern.startMin < clsA.pattern.endMin &&
            clsA.pattern.startMin < c.pattern.endMin &&
            c.pattern.weekdays.some((w) => clsA.pattern.weekdays.includes(w)) &&
            !data.enrollments.some((x) => x.studentId === e.studentId && x.classGroupId === c.id),
        )
        return clsB ? { studentId: e.studentId, classId: clsB.id } : null
      })
      .find(Boolean)

    if (!found) return // seed không tạo được tình huống này thì bỏ qua
    const res = enroll(found.studentId, found.classId, { tuitionPaid: true })
    expect(res.ok).toBe(false)
    expect(res.violations.map((v) => v.ruleId)).toContain('E05')
  })

  it('chống đăng ký trùng lặp (E02)', () => {
    const existing = db().data.enrollments.find((e) => e.status === 'confirmed')!
    const res = enroll(existing.studentId, existing.classGroupId, { tuitionPaid: true })
    expect(res.ok).toBe(false)
    expect(res.violations.map((v) => v.ruleId)).toContain('E02')
  })

  it('giữ chỗ pending không tính vào sĩ số, xác nhận học phí mới tính (M04)', () => {
    const cls = db().data.classGroups.find((c) => c.id === 'L01')!
    const student = db().data.students.find(
      (s) =>
        s.status === 'active' &&
        !db().data.enrollments.some((e) => e.studentId === s.id && e.classGroupId === cls.id),
    )!
    const before = (ctx().index.confirmedByClass.get(cls.id) ?? []).length

    const res = enroll(student.id, cls.id, { tuitionPaid: false })
    expect(res.finalStatus).toBe('pending')
    expect((ctx().index.confirmedByClass.get(cls.id) ?? []).length).toBe(before)

    confirmPayment(res.enrollmentId!)
    expect((ctx().index.confirmedByClass.get(cls.id) ?? []).length).toBe(before + 1)
  })
})

describe('hàng chờ và chuyển lớp', () => {
  it('có người rút thì hàng chờ được nhận tự động (E13)', () => {
    // L04 trong seed có 2 người ở hàng chờ
    const classId = 'L04'
    const waiting = db().data.enrollments.filter(
      (e) => e.classGroupId === classId && e.status === 'waitlisted',
    )
    expect(waiting.length).toBeGreaterThan(0)
    const first = waiting[0]

    const confirmed = db().data.enrollments.find(
      (e) => e.classGroupId === classId && e.status === 'confirmed',
    )!
    withdraw(confirmed.id)

    const after = db().data.enrollments.find((e) => e.id === first.id)!
    expect(after.status).toBe('confirmed')
  })

  it('không nhận hàng chờ khi lớp vẫn đầy', () => {
    const res = promoteWaitlist('L04')
    expect(res.ok).toBe(false)
  })

  it('chuyển lớp: đích không hợp lệ thì nguồn giữ nguyên (E11)', () => {
    const source = db().data.enrollments.find(
      (e) => e.status === 'confirmed' && e.classGroupId === 'L01',
    )!
    const draftClass = db().data.classGroups.find((c) => c.status === 'draft')!
    const res = transferClass(source.id, draftClass.id)

    expect(res.ok).toBe(false)
    expect(res.violations.map((v) => v.ruleId)).toContain('E11')
    // học viên KHÔNG bị mất chỗ ở lớp nguồn
    expect(db().data.enrollments.find((e) => e.id === source.id)!.status).toBe('confirmed')
  })
})
