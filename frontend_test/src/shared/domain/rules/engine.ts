import type { Rule, RuleContext, Severity, Violation } from './types'

/** Một hàm validate duy nhất cho mọi domain (xếp lịch, đăng ký, xuất file). */
export function validate<T>(subjects: T[], rules: Rule<T>[], ctx: RuleContext): Violation[] {
  const out: Violation[] = []
  for (const subject of subjects) {
    for (const rule of rules) {
      out.push(...rule.check(subject, ctx))
    }
  }
  return out.sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity])
}

const WEIGHT: Record<Severity, number> = { error: 3, warning: 2, info: 1 }

export const isBlocked = (violations: Violation[]) =>
  violations.some((v) => v.severity === 'error')

export const errorsOf = (violations: Violation[]) =>
  violations.filter((v) => v.severity === 'error')

export function groupBySubject(violations: Violation[]): Map<string, Violation[]> {
  const map = new Map<string, Violation[]>()
  for (const v of violations) {
    if (!v.subjectId) continue
    const arr = map.get(v.subjectId)
    if (arr) arr.push(v)
    else map.set(v.subjectId, [v])
  }
  return map
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'Chặn',
  warning: 'Cảnh báo',
  info: 'Thông tin',
}
