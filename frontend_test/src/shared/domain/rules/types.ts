import type { ScheduleIndex } from '../scheduleIndex'
import type { Enrollment, ID, MasterData, Role, Session } from '../types'

export type Severity = 'error' | 'warning' | 'info'
export type RuleDomain = 'schedule' | 'enrollment' | 'export'

export interface Violation {
  ruleId: string
  domain: RuleDomain
  severity: Severity
  message: string
  /** id của đối tượng đang xét (session / enrollment) */
  subjectId?: ID
  /** id các đối tượng đối nghịch — dùng để highlight trên calendar */
  conflictWith?: ID[]
  resource?: { kind: 'room' | 'teacher' | 'student' | 'class'; id: ID }
  suggestion?: string
}

export interface RuleContext {
  data: MasterData
  index: ScheduleIndex
  /** ISO datetime, tiêm từ ngoài để test tất định */
  now: string
  /** khi sửa 1 buổi: bỏ qua chính nó để nó không tự xung đột với bản cũ */
  ignoreIds: Set<ID>
  actor: { role: Role; id: ID }
}

export interface Rule<T> {
  id: string
  domain: RuleDomain
  severity: Severity
  label: string
  check(subject: T, ctx: RuleContext): Violation[]
}

export type SessionRule = Rule<Session>
export type EnrollmentRule = Rule<Enrollment>
