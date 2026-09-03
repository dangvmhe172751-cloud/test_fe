import { describe, expect, it } from 'vitest'
import { makeContext } from '@/mocks/store'
import { toMin } from '../time'
import type { Enrollment, MasterData, Weekday } from '../types'
import { ENROLLMENT_RULES, TRANSFER_RULES } from './enrollment'
import { validate } from './engine'

const ALL: Weekday[] = [0, 1, 2, 3, 4, 5, 6]
const hours = (from: string, to: string) =>
  ALL.map((weekday) => ({ weekday, startMin: toMin(from), endMin: toMin(to) }))

const NOW = '2026-03-02T07:00:00.000Z'

function fixture(): MasterData {
  return {
    users: [{ id: 'U01', username: 'admin', fullName: 'Admin', role: 'admin' }],
    subjects: [{ id: 'SUB01', code: 'ENG', name: 'Tiếng Anh' }],
    teachers: [
      {
        id: 'T1', code: 'T1', fullName: 'GV Một', email: 'a@b.c', phone: '0900000000',
        subjectIds: ['SUB01'], availability: hours('07:00', '22:00'), leaves: [],
        maxHoursPerWeek: 40, status: 'active',
      },
    ],
    students: [
      { id: 'S1', code: 'S1', fullName: 'HV Một', dob: '2010-01-01', level: 'A1', guardian: { name: 'PH', phone: '09' }, status: 'active' },
      { id: 'S2', code: 'S2', fullName: 'HV Hai', dob: '2010-01-01', level: 'A1', guardian: { name: 'PH', phone: '09' }, status: 'debt' },
      { id: 'S3', code: 'S3', fullName: 'HV Ba', dob: '2018-01-01', level: 'A1', guardian: { name: 'PH', phone: '09' }, status: 'active' },
    ],
    rooms: [
      { id: 'R1', name: 'R1', capacity: 2, equipment: [], openHours: hours('07:00', '22:00'), blackouts: [], status: 'available' },
    ],
    courses: [
      { id: 'C1', code: 'C1', name: 'Khoá 1', subjectId: 'SUB01', totalSessions: 10, sessionDurationMin: 90, requiredEquipment: [], maxStudents: 10, prerequisiteCourseIds: [], minAge: 10, tuition: 0 },
      { id: 'C2', code: 'C2', name: 'Khoá 2', subjectId: 'SUB01', totalSessions: 10, sessionDurationMin: 90, requiredEquipment: [], maxStudents: 10, prerequisiteCourseIds: ['C1'], tuition: 0 },
    ],
    classGroups: [
      { id: 'CL1', courseId: 'C1', name: 'CL1', startDate: '2026-03-02', endDate: '2026-04-30', primaryTeacherId: 'T1', defaultRoomId: 'R1', pattern: { weekdays: [1], startMin: toMin('08:00'), endMin: toMin('09:30') }, status: 'published' },
      { id: 'CL2', courseId: 'C1', name: 'CL2', startDate: '2026-03-02', endDate: '2026-04-30', primaryTeacherId: 'T1', defaultRoomId: 'R1', pattern: { weekdays: [1], startMin: toMin('08:00'), endMin: toMin('09:30') }, status: 'published' },
      { id: 'CL3', courseId: 'C2', name: 'CL3', startDate: '2026-03-02', endDate: '2026-04-30', primaryTeacherId: 'T1', defaultRoomId: 'R1', pattern: { weekdays: [1], startMin: toMin('10:00'), endMin: toMin('11:30') }, status: 'draft' },
    ],
    sessions: [
      { id: 'SS1', classGroupId: 'CL1', date: '2026-03-09', startMin: toMin('08:00'), endMin: toMin('09:30'), teacherId: 'T1', roomId: 'R1', status: 'scheduled' },
      { id: 'SS2', classGroupId: 'CL2', date: '2026-03-09', startMin: toMin('08:00'), endMin: toMin('09:30'), teacherId: 'T1', roomId: 'R1', status: 'scheduled' },
    ],
    enrollments: [],
    attendances: [],
    holidays: [],
    settings: {
      name: 'TT', openHours: hours('07:00', '22:00'), bufferMin: 0,
      enrollmentHoldHours: 48, lateJoinMaxSessions: 3, withdrawWarnPercent: 30,
    },
    exportLogs: [],
    notifications: [],
  }
}

const enrollment = (over: Partial<Enrollment> = {}): Enrollment => ({
  id: 'NEW', studentId: 'S1', classGroupId: 'CL1',
  status: 'confirmed', createdAt: NOW, ...over,
})

const ids = (e: Enrollment, data: MasterData) =>
  validate([e], ENROLLMENT_RULES, makeContext(data, { now: NOW })).map((v) => v.ruleId)

describe('E01 — lớp chưa mở đăng ký', () => {
  it('chặn đăng ký vào lớp còn ở bản nháp', () => {
    expect(ids(enrollment({ classGroupId: 'CL3' }), fixture())).toContain('E01')
  })
})

describe('E02 — đăng ký trùng', () => {
  it('chặn khi học viên đã có đăng ký đang hiệu lực ở lớp đó', () => {
    const data = fixture()
    data.enrollments = [enrollment({ id: 'OLD' })]
    expect(ids(enrollment(), data)).toContain('E02')
  })
  it('không chặn nếu đăng ký cũ đã rút', () => {
    const data = fixture()
    data.enrollments = [enrollment({ id: 'OLD', status: 'withdrawn' })]
    expect(ids(enrollment(), data)).not.toContain('E02')
  })
})

describe('E04 — lớp đầy', () => {
  it('chặn khi đã đủ chỗ theo min(maxStudents, capacity phòng)', () => {
    const data = fixture()
    data.enrollments = [
      enrollment({ id: 'A', studentId: 'S1' }),
      enrollment({ id: 'B', studentId: 'S3' }),
    ]
    // capacity phòng = 2 → đã đầy dù course cho phép 10
    expect(ids(enrollment({ id: 'NEW', studentId: 'S2' }), data)).toContain('E04')
  })
  it('bản ghi hàng chờ không bị E04 chặn tiếp', () => {
    const data = fixture()
    data.enrollments = [
      enrollment({ id: 'A', studentId: 'S1' }),
      enrollment({ id: 'B', studentId: 'S3' }),
    ]
    expect(ids(enrollment({ id: 'NEW', studentId: 'S2', status: 'waitlisted' }), data)).not.toContain('E04')
  })
})

describe('E05 — trùng lịch cá nhân học viên', () => {
  it('chặn khi buổi tương lai của lớp mới trùng lớp đang học', () => {
    const data = fixture()
    data.enrollments = [enrollment({ id: 'A', studentId: 'S1', classGroupId: 'CL1' })]
    expect(ids(enrollment({ id: 'NEW', studentId: 'S1', classGroupId: 'CL2' }), data)).toContain('E05')
  })
  it('không chặn khi 2 lớp khác khung giờ', () => {
    const data = fixture()
    data.classGroups[1].pattern.startMin = toMin('14:00')
    data.sessions[1].startMin = toMin('14:00')
    data.sessions[1].endMin = toMin('15:30')
    data.enrollments = [enrollment({ id: 'A', studentId: 'S1', classGroupId: 'CL1' })]
    expect(ids(enrollment({ id: 'NEW', studentId: 'S1', classGroupId: 'CL2' }), data)).not.toContain('E05')
  })
})

describe('E06 — khóa tiên quyết', () => {
  it('chặn khi chưa hoàn thành khóa tiên quyết', () => {
    const data = fixture()
    data.classGroups[2].status = 'published'
    expect(ids(enrollment({ classGroupId: 'CL3' }), data)).toContain('E06')
  })
  it('qua được khi đã học xong lớp thuộc khóa tiên quyết', () => {
    const data = fixture()
    data.classGroups[2].status = 'published'
    data.classGroups[0].status = 'finished'
    data.enrollments = [enrollment({ id: 'A', studentId: 'S1', classGroupId: 'CL1' })]
    expect(ids(enrollment({ classGroupId: 'CL3' }), data)).not.toContain('E06')
  })
})

describe('E07 — tuổi đầu vào', () => {
  it('cảnh báo khi học viên nhỏ hơn tuổi tối thiểu', () => {
    const data = fixture()
    const violations = validate(
      [enrollment({ studentId: 'S3' })],
      ENROLLMENT_RULES,
      makeContext(data, { now: NOW }),
    )
    const e07 = violations.find((v) => v.ruleId === 'E07')
    expect(e07?.severity).toBe('warning')
  })
})

describe('E08 — trạng thái học viên', () => {
  it('chặn học viên đang nợ học phí', () => {
    expect(ids(enrollment({ studentId: 'S2' }), fixture())).toContain('E08')
  })
})

describe('E11 — chuyển lớp', () => {
  it('chặn chuyển sang lớp đích không hợp lệ', () => {
    const data = fixture()
    data.enrollments = [enrollment({ id: 'A', studentId: 'S1', classGroupId: 'CL1' })]
    const target = enrollment({ id: 'NEW', studentId: 'S1', classGroupId: 'CL3' }) // CL3 là draft
    const violations = validate([target], TRANSFER_RULES, makeContext(data, { now: NOW }))
    expect(violations.map((v) => v.ruleId)).toContain('E11')
    expect(violations[0].severity).toBe('error')
  })
})

describe('E13 — hàng chờ', () => {
  it('báo có thể nhận khi lớp còn chỗ', () => {
    const data = fixture()
    data.enrollments = [enrollment({ id: 'A', studentId: 'S1' })]
    const waiting = enrollment({ id: 'W', studentId: 'S3', status: 'waitlisted', waitlistPosition: 1 })
    data.enrollments.push(waiting)
    const violations = validate([waiting], ENROLLMENT_RULES, makeContext(data, { now: NOW }))
    expect(violations.map((v) => v.ruleId)).toContain('E13')
  })
})
