import { generateSessions } from '@/shared/domain/generate'
import { addDays, startOfWeek, todayStr, toMin } from '@/shared/domain/time'
import type {
  Attendance,
  ClassGroup,
  Course,
  Enrollment,
  Holiday,
  MasterData,
  Room,
  Session,
  Student,
  Subject,
  Teacher,
  User,
  WeeklyAvailability,
  Weekday,
} from '@/shared/domain/types'

/** PRNG tất định — seed cố định để mọi lần chạy ra cùng dữ liệu, test mới ổn định */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}
const rand = rng(20260903)
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý']
const DEM = ['Văn', 'Thị', 'Hữu', 'Đức', 'Minh', 'Quang', 'Thanh', 'Ngọc', 'Gia', 'Bảo', 'Khánh', 'Tuấn']
const TEN = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hạnh', 'Hùng', 'Khoa', 'Lan', 'Linh', 'Long', 'Mai', 'Nam', 'Nga', 'Nhung', 'Phúc', 'Quân', 'Sơn', 'Thảo', 'Trang', 'Tú', 'Vy', 'Yến']
const name = () => `${pick(HO)} ${pick(DEM)} ${pick(TEN)}`

const WD = (weekdays: Weekday[], from: string, to: string): WeeklyAvailability[] =>
  weekdays.map((weekday) => ({ weekday, startMin: toMin(from), endMin: toMin(to) }))

const MON_TO_SAT: Weekday[] = [1, 2, 3, 4, 5, 6]
const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

// Neo toàn bộ dữ liệu vào thứ 2 của tuần hiện tại → mở app luôn thấy lịch có buổi
const MONDAY = startOfWeek(todayStr())
const TERM_START = addDays(MONDAY, -28)

// ------------------------------------------------------------- 1. subjects
const subjects: Subject[] = [
  { id: 'SUB01', code: 'ENG', name: 'Tiếng Anh' },
  { id: 'SUB02', code: 'IELTS', name: 'Luyện thi IELTS' },
  { id: 'SUB03', code: 'MATH', name: 'Toán' },
  { id: 'SUB04', code: 'IT', name: 'Tin học' },
  { id: 'SUB05', code: 'JPN', name: 'Tiếng Nhật' },
]

// ------------------------------------------------------------- 2. teachers
const TEACHER_SEED: Array<[string, string[], string, string, number]> = [
  ['Nguyễn Thu Hà', ['SUB01', 'SUB02'], '08:00', '21:00', 20],
  ['Trần Minh Khôi', ['SUB01'], '08:00', '17:00', 18],
  ['Lê Quốc Bảo', ['SUB02'], '13:00', '21:00', 16],
  ['Phạm Ngọc Lan', ['SUB03'], '07:00', '17:00', 22],
  ['Hoàng Anh Tuấn', ['SUB03', 'SUB04'], '13:00', '21:00', 20],
  ['Vũ Hải Yến', ['SUB04'], '08:00', '18:00', 15],
  ['Đặng Gia Huy', ['SUB05'], '17:00', '21:00', 12],
  ['Bùi Thanh Trúc', ['SUB01', 'SUB05'], '08:00', '21:00', 24],
]

const teachers: Teacher[] = TEACHER_SEED.map(([fullName, subjectIds, from, to, maxH], i) => ({
  id: `GV${String(i + 1).padStart(2, '0')}`,
  code: `GV${String(i + 1).padStart(3, '0')}`,
  fullName,
  email: `gv${i + 1}@ttdt.edu.vn`,
  phone: `09${int(10, 89)}${int(100000, 999999)}`,
  subjectIds,
  availability: WD(MON_TO_SAT, from, to),
  leaves: i === 2 ? [{ from: addDays(MONDAY, 2), to: addDays(MONDAY, 4), reason: 'Nghỉ phép cá nhân' }] : [],
  maxHoursPerWeek: maxH,
  status: i === 7 ? 'active' : 'active',
}))

// ------------------------------------------------------------- 3. students
const LEVELS = ['A1', 'A2', 'B1', 'B2']
const students: Student[] = Array.from({ length: 80 }, (_, i) => {
  const status: Student['status'] =
    i % 23 === 0 ? 'paused' : i % 31 === 0 ? 'debt' : i % 37 === 0 ? 'graduated' : 'active'
  return {
    id: `HV${String(i + 1).padStart(3, '0')}`,
    code: `HV${String(2026000 + i + 1)}`,
    fullName: name(),
    dob: `${int(2000, 2014)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
    level: pick(LEVELS),
    guardian: { name: name(), phone: `09${int(10, 89)}${int(100000, 999999)}` },
    status,
  }
})

// ------------------------------------------------------------- 4. rooms
const rooms: Room[] = [
  { id: 'P101', name: 'P101', capacity: 20, equipment: ['Máy chiếu', 'Loa'], openHours: WD(ALL_DAYS, '07:00', '21:30'), blackouts: [], status: 'available' },
  { id: 'P102', name: 'P102', capacity: 16, equipment: ['Máy chiếu', 'Bảng tương tác'], openHours: WD(ALL_DAYS, '07:00', '21:30'), blackouts: [], status: 'available' },
  { id: 'P103', name: 'P103', capacity: 12, equipment: ['Loa'], openHours: WD(ALL_DAYS, '07:00', '21:30'), blackouts: [{ from: addDays(MONDAY, 3), to: addDays(MONDAY, 3), reason: 'Sơn lại tường' }], status: 'available' },
  { id: 'P201', name: 'P201', capacity: 30, equipment: ['Máy chiếu', 'Loa', 'Micro'], openHours: WD(ALL_DAYS, '07:00', '21:30'), blackouts: [], status: 'available' },
  { id: 'LAB1', name: 'LAB1 (Máy tính)', capacity: 24, equipment: ['Máy chiếu', 'Máy tính', 'Mạng LAN'], openHours: WD(MON_TO_SAT, '08:00', '20:00'), blackouts: [], status: 'available' },
  { id: 'P302', name: 'P302', capacity: 10, equipment: [], openHours: WD(ALL_DAYS, '07:00', '21:30'), blackouts: [], status: 'maintenance' },
]

// ------------------------------------------------------------- 5. courses
const courses: Course[] = [
  { id: 'KH01', code: 'ENG-A1', name: 'Tiếng Anh giao tiếp A1', subjectId: 'SUB01', totalSessions: 24, sessionDurationMin: 90, requiredEquipment: ['Loa'], maxStudents: 18, prerequisiteCourseIds: [], minAge: 10, tuition: 4_800_000 },
  { id: 'KH02', code: 'ENG-A2', name: 'Tiếng Anh giao tiếp A2', subjectId: 'SUB01', totalSessions: 24, sessionDurationMin: 90, requiredEquipment: ['Loa'], maxStudents: 18, prerequisiteCourseIds: ['KH01'], minAge: 10, requiredLevel: 'A2', tuition: 5_400_000 },
  { id: 'KH03', code: 'IELTS-65', name: 'IELTS 6.5+', subjectId: 'SUB02', totalSessions: 30, sessionDurationMin: 120, requiredEquipment: ['Máy chiếu', 'Loa'], maxStudents: 14, prerequisiteCourseIds: [], minAge: 15, requiredLevel: 'B2', tuition: 12_000_000 },
  { id: 'KH04', code: 'MATH-9', name: 'Toán nâng cao lớp 9', subjectId: 'SUB03', totalSessions: 32, sessionDurationMin: 90, requiredEquipment: [], maxStudents: 25, prerequisiteCourseIds: [], minAge: 13, tuition: 6_400_000 },
  { id: 'KH05', code: 'IT-PY', name: 'Lập trình Python cơ bản', subjectId: 'SUB04', totalSessions: 20, sessionDurationMin: 120, requiredEquipment: ['Máy tính', 'Máy chiếu'], maxStudents: 20, prerequisiteCourseIds: [], minAge: 12, tuition: 7_200_000 },
  { id: 'KH06', code: 'JPN-N5', name: 'Tiếng Nhật N5', subjectId: 'SUB05', totalSessions: 28, sessionDurationMin: 90, requiredEquipment: ['Loa'], maxStudents: 16, prerequisiteCourseIds: [], tuition: 6_800_000 },
]

// ------------------------------------------------------------- 6. classGroups + 7. sessions
interface ClassSeed {
  id: string
  courseId: string
  name: string
  teacherId: string
  roomId: string
  weekdays: Weekday[]
  from: string
  to: string
  startOffsetDays: number
  status: ClassGroup['status']
}

const CLASS_SEED: ClassSeed[] = [
  { id: 'L01', courseId: 'KH01', name: 'ENG-A1.01', teacherId: 'GV01', roomId: 'P101', weekdays: [2, 5], from: '18:00', to: '19:30', startOffsetDays: -28, status: 'published' },
  { id: 'L02', courseId: 'KH01', name: 'ENG-A1.02', teacherId: 'GV02', roomId: 'P102', weekdays: [1, 4], from: '08:00', to: '09:30', startOffsetDays: -21, status: 'published' },
  { id: 'L03', courseId: 'KH02', name: 'ENG-A2.01', teacherId: 'GV08', roomId: 'P101', weekdays: [3, 6], from: '18:00', to: '19:30', startOffsetDays: -14, status: 'published' },
  { id: 'L04', courseId: 'KH03', name: 'IELTS-65.01', teacherId: 'GV03', roomId: 'P102', weekdays: [2, 5], from: '19:45', to: '21:45', startOffsetDays: -14, status: 'published' },
  { id: 'L05', courseId: 'KH04', name: 'MATH9.01', teacherId: 'GV04', roomId: 'P201', weekdays: [1, 4], from: '14:00', to: '15:30', startOffsetDays: -28, status: 'published' },
  { id: 'L06', courseId: 'KH04', name: 'MATH9.02', teacherId: 'GV05', roomId: 'P201', weekdays: [3, 6], from: '17:00', to: '18:30', startOffsetDays: -7, status: 'published' },
  { id: 'L07', courseId: 'KH05', name: 'PY-CB.01', teacherId: 'GV06', roomId: 'LAB1', weekdays: [2, 5], from: '13:30', to: '15:30', startOffsetDays: -7, status: 'published' },
  { id: 'L08', courseId: 'KH06', name: 'JPN-N5.01', teacherId: 'GV07', roomId: 'P103', weekdays: [1, 4], from: '18:00', to: '19:30', startOffsetDays: 0, status: 'published' },
  { id: 'L09', courseId: 'KH01', name: 'ENG-A1.03', teacherId: 'GV02', roomId: 'P103', weekdays: [0], from: '09:00', to: '10:30', startOffsetDays: 0, status: 'published' },
  { id: 'L10', courseId: 'KH05', name: 'PY-CB.02', teacherId: 'GV06', roomId: 'LAB1', weekdays: [1, 4], from: '18:30', to: '20:30', startOffsetDays: 7, status: 'draft' },
]

const holidays: Holiday[] = [
  { id: 'H01', from: addDays(MONDAY, 9), to: addDays(MONDAY, 9), name: 'Nghỉ bù lễ' },
]
const holidaySet = new Set(holidays.map((h) => h.from))

const classGroups: ClassGroup[] = []
const sessions: Session[] = []

for (const seed of CLASS_SEED) {
  const course = courses.find((c) => c.id === seed.courseId)!
  const startDate = addDays(TERM_START, seed.startOffsetDays + 28)
  const generated = generateSessions({
    classGroupId: seed.id,
    startDate,
    totalSessions: course.totalSessions,
    weekdays: seed.weekdays,
    startMin: toMin(seed.from),
    endMin: toMin(seed.to),
    teacherId: seed.teacherId,
    roomId: seed.roomId,
    skipDates: holidaySet,
  })
  classGroups.push({
    id: seed.id,
    courseId: seed.courseId,
    name: seed.name,
    startDate,
    endDate: generated.at(-1)?.date ?? startDate,
    primaryTeacherId: seed.teacherId,
    defaultRoomId: seed.roomId,
    pattern: { weekdays: seed.weekdays, startMin: toMin(seed.from), endMin: toMin(seed.to) },
    status: seed.status,
  })
  // buổi trong quá khứ đánh dấu đã dạy (R13 sẽ chặn sửa các buổi này)
  const today = todayStr()
  for (const s of generated) {
    sessions.push({ ...s, status: s.date < today ? 'done' : 'scheduled' })
  }
}

// Cố ý cài 2 xung đột để mở app là thấy engine làm việc:
// (1) đổi phòng 1 buổi của L06 sang P201 trùng giờ L05 → R01 + R02
const clash1 = sessions.find((s) => s.classGroupId === 'L06' && s.date > todayStr())
if (clash1) {
  clash1.date = addDays(MONDAY, 3)
  clash1.startMin = toMin('14:30')
  clash1.endMin = toMin('16:00')
  clash1.roomId = 'P201'
  clash1.note = 'Buổi bù — đang xung đột, để demo engine'
}
// (2) một buổi của L04 rơi vào ngày GV03 nghỉ phép → R07
const clash2 = sessions.find(
  (s) => s.classGroupId === 'L04' && s.date === addDays(MONDAY, 2) && s.status === 'scheduled',
)
if (clash2) clash2.note = 'Trùng ngày GV nghỉ phép'

// ------------------------------------------------------------- 8. enrollments
const enrollments: Enrollment[] = []
const nowIso = new Date().toISOString()
let enrollSeq = 0
const nextEnrollId = () => `EN${String(++enrollSeq).padStart(4, '0')}`

const activeStudents = students.filter((s) => s.status === 'active')
let cursor = 0
for (const cls of classGroups) {
  if (cls.status === 'draft') continue
  const course = courses.find((c) => c.id === cls.courseId)!
  const room = rooms.find((r) => r.id === cls.defaultRoomId)!
  const cap = Math.min(course.maxStudents, room.capacity)
  // L04 cố ý lấp đầy để minh hoạ hàng chờ; các lớp khác còn chỗ trống
  const target = cls.id === 'L04' ? cap : Math.max(4, cap - int(0, 4))

  for (let i = 0; i < target; i++) {
    const st = activeStudents[cursor++ % activeStudents.length]
    if (enrollments.some((e) => e.studentId === st.id && e.classGroupId === cls.id)) continue
    enrollments.push({
      id: nextEnrollId(),
      studentId: st.id,
      classGroupId: cls.id,
      status: 'confirmed',
      createdAt: nowIso,
      confirmedAt: nowIso,
    })
  }
  // 2 hồ sơ đang giữ chỗ chờ học phí + 2 hàng chờ cho lớp IELTS
  if (cls.id === 'L04') {
    for (let i = 0; i < 2; i++) {
      const st = activeStudents[(cursor + 40 + i) % activeStudents.length]
      enrollments.push({
        id: nextEnrollId(),
        studentId: st.id,
        classGroupId: cls.id,
        status: 'waitlisted',
        waitlistPosition: i + 1,
        createdAt: nowIso,
      })
    }
  }
  if (cls.id === 'L07') {
    const st = activeStudents[(cursor + 55) % activeStudents.length]
    enrollments.push({
      id: nextEnrollId(),
      studentId: st.id,
      classGroupId: cls.id,
      status: 'pending',
      holdExpiresAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
      createdAt: nowIso,
    })
  }
}

// ------------------------------------------------------------- 9. attendances
const attendances: Attendance[] = []
let attSeq = 0
const studentsByClass = new Map<string, string[]>()
for (const e of enrollments) {
  if (e.status !== 'confirmed') continue
  const arr = studentsByClass.get(e.classGroupId) ?? []
  arr.push(e.studentId)
  studentsByClass.set(e.classGroupId, arr)
}
for (const s of sessions) {
  if (s.status !== 'done') continue
  for (const studentId of studentsByClass.get(s.classGroupId) ?? []) {
    const r = rand()
    attendances.push({
      id: `AT${String(++attSeq).padStart(5, '0')}`,
      sessionId: s.id,
      studentId,
      status: r > 0.12 ? 'present' : r > 0.06 ? 'late' : r > 0.02 ? 'absent' : 'excused',
    })
  }
}

// ------------------------------------------------------------- 10. users
const users: User[] = [
  { id: 'U01', username: 'admin', fullName: 'Quản trị hệ thống', role: 'admin' },
  { id: 'U02', username: 'hocvu', fullName: 'Nguyễn Thị Học Vụ', role: 'academic' },
  { id: 'U03', username: 'gv.ha', fullName: 'Nguyễn Thu Hà', role: 'teacher', linkedId: 'GV01' },
  { id: 'U04', username: 'hv.001', fullName: students[0].fullName, role: 'student', linkedId: students[0].id },
]

export function createSeedData(): MasterData {
  return {
    users,
    subjects,
    teachers,
    students,
    rooms,
    courses,
    classGroups,
    sessions,
    enrollments,
    attendances,
    holidays,
    settings: {
      name: 'Trung tâm Đào tạo Bình Minh',
      openHours: WD(ALL_DAYS, '07:00', '21:30'),
      bufferMin: 10,
      enrollmentHoldHours: 48,
      lateJoinMaxSessions: 3,
      withdrawWarnPercent: 30,
    },
    exportLogs: [],
    notifications: [],
  }
}

export { MONDAY as SEED_MONDAY }
