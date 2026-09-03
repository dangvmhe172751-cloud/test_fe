import { describe, expect, it } from 'vitest'
import { makeContext } from '@/mocks/store'
import { overlaps, toMin } from '../time'
import type { MasterData, Session, Weekday } from '../types'
import { isBlocked, validate } from './engine'
import { SCHEDULE_RULES } from './schedule'

const ALL: Weekday[] = [0, 1, 2, 3, 4, 5, 6]
const hours = (from: string, to: string) =>
  ALL.map((weekday) => ({ weekday, startMin: toMin(from), endMin: toMin(to) }))

/** Dữ liệu tối thiểu, dựng riêng cho test để không phụ thuộc seed */
function fixture(overrides: Partial<MasterData> = {}): MasterData {
  return {
    users: [{ id: 'U01', username: 'admin', fullName: 'Admin', role: 'admin' }],
    subjects: [{ id: 'SUB01', code: 'ENG', name: 'Tiếng Anh' }],
    teachers: [
      {
        id: 'T1', code: 'T1', fullName: 'GV Một', email: 'a@b.c', phone: '0900000000',
        subjectIds: ['SUB01'], availability: hours('07:00', '22:00'), leaves: [],
        maxHoursPerWeek: 40, status: 'active',
      },
      {
        id: 'T2', code: 'T2', fullName: 'GV Hai', email: 'd@b.c', phone: '0900000001',
        subjectIds: [], availability: hours('07:00', '22:00'), leaves: [],
        maxHoursPerWeek: 40, status: 'active',
      },
    ],
    students: [
      {
        id: 'S1', code: 'S1', fullName: 'HV Một', dob: '2010-01-01',
        guardian: { name: 'PH', phone: '0900000002' }, status: 'active',
      },
    ],
    rooms: [
      { id: 'R1', name: 'R1', capacity: 20, equipment: ['Loa'], openHours: hours('07:00', '22:00'), blackouts: [], status: 'available' },
      { id: 'R2', name: 'R2', capacity: 2, equipment: [], openHours: hours('07:00', '22:00'), blackouts: [], status: 'available' },
    ],
    courses: [
      {
        id: 'C1', code: 'C1', name: 'Khoá 1', subjectId: 'SUB01', totalSessions: 10,
        sessionDurationMin: 90, requiredEquipment: ['Loa'], maxStudents: 20,
        prerequisiteCourseIds: [], tuition: 0,
      },
    ],
    classGroups: [
      {
        id: 'CL1', courseId: 'C1', name: 'CL1', startDate: '2026-03-02', endDate: '2026-04-30',
        primaryTeacherId: 'T1', defaultRoomId: 'R1',
        pattern: { weekdays: [1], startMin: toMin('08:00'), endMin: toMin('09:30') },
        status: 'published',
      },
      {
        id: 'CL2', courseId: 'C1', name: 'CL2', startDate: '2026-03-02', endDate: '2026-04-30',
        primaryTeacherId: 'T2', defaultRoomId: 'R2',
        pattern: { weekdays: [1], startMin: toMin('08:00'), endMin: toMin('09:30') },
        status: 'published',
      },
    ],
    sessions: [],
    enrollments: [],
    attendances: [],
    holidays: [],
    settings: {
      name: 'TT Test', openHours: hours('07:00', '22:00'), bufferMin: 10,
      enrollmentHoldHours: 48, lateJoinMaxSessions: 3, withdrawWarnPercent: 30,
    },
    exportLogs: [],
    notifications: [],
    ...overrides,
  }
}

const session = (over: Partial<Session> = {}): Session => ({
  id: 'X1', classGroupId: 'CL1', date: '2026-03-02',
  startMin: toMin('08:00'), endMin: toMin('09:30'),
  teacherId: 'T1', roomId: 'R1', status: 'scheduled', ...over,
})

const run = (s: Session, data: MasterData, ignore: string[] = []) =>
  validate([s], SCHEDULE_RULES, makeContext(data, { now: '2026-03-02T07:00:00.000Z', ignoreIds: new Set(ignore) }))

const ids = (s: Session, data: MasterData) => run(s, data).map((v) => v.ruleId)

describe('overlaps — khoảng nửa mở [start, end)', () => {
  it('hai buổi nối đuôi nhau KHÔNG trùng', () => {
    expect(overlaps({ startMin: 480, endMin: 600 }, { startMin: 600, endMin: 720 })).toBe(false)
  })
  it('giao nhau 1 phút vẫn tính là trùng', () => {
    expect(overlaps({ startMin: 480, endMin: 601 }, { startMin: 600, endMin: 720 })).toBe(true)
  })
  it('buổi lồng hoàn toàn trong buổi khác là trùng', () => {
    expect(overlaps({ startMin: 500, endMin: 550 }, { startMin: 480, endMin: 600 })).toBe(true)
  })
})

describe('R01 — phòng bị đặt trùng giờ', () => {
  it('chặn khi 2 buổi cùng phòng giao nhau', () => {
    const data = fixture()
    data.sessions = [session({ id: 'A', classGroupId: 'CL2', teacherId: 'T2' })]
    expect(ids(session({ id: 'B' }), data)).toContain('R01')
  })

  it('KHÔNG chặn khi 2 buổi nối đuôi nhau 09:30 → 09:30', () => {
    const data = fixture()
    data.sessions = [session({ id: 'A', classGroupId: 'CL2', teacherId: 'T2' })]
    const next = session({ id: 'B', startMin: toMin('09:30'), endMin: toMin('11:00') })
    expect(ids(next, data)).not.toContain('R01')
  })

  it('buổi đã huỷ không chiếm phòng', () => {
    const data = fixture()
    data.sessions = [session({ id: 'A', classGroupId: 'CL2', teacherId: 'T2', status: 'cancelled' })]
    expect(ids(session({ id: 'B' }), data)).not.toContain('R01')
  })

  it('sửa chính buổi đó không tự xung đột với bản cũ', () => {
    const data = fixture()
    data.sessions = [session({ id: 'A' })]
    const moved = session({ id: 'A', startMin: toMin('08:30'), endMin: toMin('10:00') })
    expect(run(moved, data, ['A']).map((v) => v.ruleId)).not.toContain('R01')
  })
})

describe('R02 — giáo viên dạy 2 lớp trùng giờ', () => {
  it('chặn khi cùng GV, khác phòng, trùng giờ', () => {
    const data = fixture()
    data.sessions = [session({ id: 'A', classGroupId: 'CL2', roomId: 'R2' })]
    expect(ids(session({ id: 'B' }), data)).toContain('R02')
  })
})

describe('R03 — học viên có 2 buổi trùng giờ', () => {
  it('chặn khi học viên học cả 2 lớp trùng khung giờ', () => {
    const data = fixture()
    data.enrollments = [
      { id: 'E1', studentId: 'S1', classGroupId: 'CL1', status: 'confirmed', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'E2', studentId: 'S1', classGroupId: 'CL2', status: 'confirmed', createdAt: '2026-01-01T00:00:00Z' },
    ]
    data.sessions = [session({ id: 'A', classGroupId: 'CL2', teacherId: 'T2', roomId: 'R2' })]
    expect(ids(session({ id: 'B' }), data)).toContain('R03')
  })

  it('đăng ký ở trạng thái hàng chờ KHÔNG gây xung đột lịch', () => {
    const data = fixture()
    data.enrollments = [
      { id: 'E1', studentId: 'S1', classGroupId: 'CL1', status: 'confirmed', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'E2', studentId: 'S1', classGroupId: 'CL2', status: 'waitlisted', createdAt: '2026-01-01T00:00:00Z' },
    ]
    data.sessions = [session({ id: 'A', classGroupId: 'CL2', teacherId: 'T2', roomId: 'R2' })]
    expect(ids(session({ id: 'B' }), data)).not.toContain('R03')
  })
})

describe('R04 — sĩ số vượt sức chứa phòng', () => {
  it('chặn khi số HV chính thức lớn hơn capacity', () => {
    const data = fixture()
    data.students = Array.from({ length: 3 }, (_, i) => ({
      id: `S${i}`, code: `S${i}`, fullName: `HV ${i}`, dob: '2010-01-01',
      guardian: { name: 'PH', phone: '0900000000' }, status: 'active' as const,
    }))
    data.enrollments = data.students.map((s, i) => ({
      id: `E${i}`, studentId: s.id, classGroupId: 'CL1',
      status: 'confirmed' as const, createdAt: '2026-01-01T00:00:00Z',
    }))
    expect(ids(session({ roomId: 'R2' }), data)).toContain('R04') // R2 chứa 2
  })
})

describe('R05 — ngoài giờ mở cửa', () => {
  it('chặn buổi bắt đầu trước giờ mở cửa', () => {
    const data = fixture()
    data.settings.openHours = hours('08:00', '20:00')
    expect(ids(session({ startMin: toMin('07:00'), endMin: toMin('08:30') }), data)).toContain('R05')
  })
})

describe('R06 — ngày lễ và phòng không dùng được', () => {
  it('chặn khi trùng ngày lễ', () => {
    const data = fixture()
    data.holidays = [{ id: 'H', from: '2026-03-02', to: '2026-03-02', name: 'Nghỉ lễ' }]
    expect(ids(session(), data)).toContain('R06')
  })
  it('chặn khi phòng đang bảo trì', () => {
    const data = fixture()
    data.rooms[0].status = 'maintenance'
    expect(ids(session(), data)).toContain('R06')
  })
  it('chặn khi phòng có blackout đúng ngày', () => {
    const data = fixture()
    data.rooms[0].blackouts = [{ from: '2026-03-02', to: '2026-03-03', reason: 'Sửa điện' }]
    expect(ids(session(), data)).toContain('R06')
  })
})

describe('R07 — giáo viên không rảnh', () => {
  it('chặn khi GV nghỉ phép', () => {
    const data = fixture()
    data.teachers[0].leaves = [{ from: '2026-03-01', to: '2026-03-05', reason: 'Việc riêng' }]
    expect(ids(session(), data)).toContain('R07')
  })
  it('chặn khi ngoài khung giờ GV đăng ký rảnh', () => {
    const data = fixture()
    data.teachers[0].availability = hours('13:00', '21:00')
    expect(ids(session(), data)).toContain('R07')
  })
})

describe('R08 / R10 — cảnh báo, không chặn', () => {
  it('GV sai chuyên môn chỉ cảnh báo', () => {
    const data = fixture()
    const violations = run(session({ teacherId: 'T2' }), data)
    expect(violations.find((v) => v.ruleId === 'R08')?.severity).toBe('warning')
    expect(isBlocked(violations.filter((v) => v.ruleId === 'R08'))).toBe(false)
  })
  it('phòng thiếu thiết bị chỉ cảnh báo', () => {
    const data = fixture()
    const violations = run(session({ roomId: 'R2' }), data)
    expect(violations.find((v) => v.ruleId === 'R10')?.severity).toBe('warning')
  })
})

describe('R09 — buổi ngoài khoảng ngày của lớp', () => {
  it('chặn buổi nằm sau ngày kết thúc', () => {
    expect(ids(session({ date: '2026-05-10' }), fixture())).toContain('R09')
  })
  it('ngày biên (đúng endDate) vẫn hợp lệ', () => {
    expect(ids(session({ date: '2026-04-30' }), fixture())).not.toContain('R09')
  })
})

describe('R11 — giáo viên vượt tải tuần', () => {
  it('cảnh báo khi tổng giờ trong tuần vượt mức', () => {
    const data = fixture()
    data.teachers[0].maxHoursPerWeek = 2
    data.sessions = [
      session({ id: 'A', date: '2026-03-03', startMin: toMin('08:00'), endMin: toMin('10:00') }),
    ]
    expect(ids(session({ id: 'B' }), data)).toContain('R11')
  })
})

describe('R12 — thiếu khoảng nghỉ giữa 2 buổi', () => {
  it('cảnh báo khi 2 buổi liền kề cách nhau dưới buffer', () => {
    const data = fixture()
    data.settings.bufferMin = 15
    data.sessions = [session({ id: 'A', classGroupId: 'CL2', teacherId: 'T2' })]
    const next = session({ id: 'B', startMin: toMin('09:35'), endMin: toMin('11:00') })
    const violations = run(next, data)
    expect(violations.map((v) => v.ruleId)).toContain('R12')
    expect(violations.map((v) => v.ruleId)).not.toContain('R01')
  })

  it('không cảnh báo khi cách đủ buffer', () => {
    const data = fixture()
    data.settings.bufferMin = 15
    data.sessions = [session({ id: 'A', classGroupId: 'CL2', teacherId: 'T2' })]
    const next = session({ id: 'B', startMin: toMin('09:45'), endMin: toMin('11:00') })
    expect(ids(next, data)).not.toContain('R12')
  })
})

describe('R13 — không sửa buổi đã dạy', () => {
  it('chặn khi đổi giờ của buổi status=done', () => {
    const data = fixture()
    data.sessions = [session({ id: 'A', status: 'done' })]
    const moved = session({ id: 'A', status: 'done', startMin: toMin('10:00'), endMin: toMin('11:30') })
    expect(run(moved, data, ['A']).map((v) => v.ruleId)).toContain('R13')
  })
})

describe('R14 — lớp đã công bố bị đổi lịch', () => {
  it('sinh thông tin nhắc thông báo học viên, không chặn', () => {
    const data = fixture()
    data.sessions = [session({ id: 'A' })]
    const moved = session({ id: 'A', date: '2026-03-09' })
    const violations = run(moved, data, ['A'])
    const r14 = violations.find((v) => v.ruleId === 'R14')
    expect(r14?.severity).toBe('info')
    expect(isBlocked(violations)).toBe(false)
  })
})

describe('engine', () => {
  it('sắp xếp vi phạm theo mức độ nghiêm trọng giảm dần', () => {
    const data = fixture()
    data.holidays = [{ id: 'H', from: '2026-03-02', to: '2026-03-02', name: 'Lễ' }]
    const violations = run(session({ teacherId: 'T2', roomId: 'R2' }), data)
    const severities = violations.map((v) => v.severity)
    expect(severities.indexOf('error')).toBeLessThan(severities.lastIndexOf('warning'))
  })

  it('buổi hoàn toàn hợp lệ không sinh vi phạm nào', () => {
    expect(run(session(), fixture())).toHaveLength(0)
  })
})
