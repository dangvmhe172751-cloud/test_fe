import { useMemo } from 'react'
import { create } from 'zustand'
import { buildScheduleIndex } from '@/shared/domain/scheduleIndex'
import type { RuleContext } from '@/shared/domain/rules/types'
import type { MasterData, Role } from '@/shared/domain/types'
import { createSeedData } from './seed'

/**
 * Ở giai đoạn FE mock, store này đóng vai trò "database".
 * Mọi ghi dữ liệu đi qua `apply()` — không component nào được mutate trực tiếp.
 */
interface DbState {
  data: MasterData
  actor: { role: Role; id: string }
  /** tăng mỗi lần ghi, dùng để memo hoá index */
  revision: number
  apply: (mutate: (draft: MasterData) => void) => void
  setActor: (actor: { role: Role; id: string }) => void
  reset: () => void
}

export const useDb = create<DbState>((set) => ({
  data: createSeedData(),
  actor: { role: 'admin', id: 'U01' },
  revision: 0,
  apply: (mutate) =>
    set((state) => {
      // clone nông từng bảng: đủ để React nhận ra thay đổi, rẻ hơn deep clone
      const draft: MasterData = {
        ...state.data,
        teachers: [...state.data.teachers],
        students: [...state.data.students],
        rooms: [...state.data.rooms],
        courses: [...state.data.courses],
        classGroups: [...state.data.classGroups],
        sessions: [...state.data.sessions],
        enrollments: [...state.data.enrollments],
        attendances: [...state.data.attendances],
        holidays: [...state.data.holidays],
        exportLogs: [...state.data.exportLogs],
        notifications: [...state.data.notifications],
      }
      mutate(draft)
      return { data: draft, revision: state.revision + 1 }
    }),
  setActor: (actor) => set({ actor }),
  reset: () => set({ data: createSeedData(), revision: 0 }),
}))

/**
 * RuleContext dùng chung cho toàn bộ engine. Index được dựng lại mỗi khi
 * dữ liệu đổi — với cỡ mock (~300 session) chi phí không đáng kể.
 */
export function useRuleContext(ignoreIds: Iterable<string> = []): RuleContext {
  const data = useDb((s) => s.data)
  const actor = useDb((s) => s.actor)
  const ignoreKey = [...ignoreIds].join(',')

  return useMemo(() => {
    const index = buildScheduleIndex(data)
    return {
      data,
      index,
      now: new Date().toISOString(),
      ignoreIds: new Set(ignoreKey ? ignoreKey.split(',') : []),
      actor,
    }
  }, [data, actor, ignoreKey])
}

/** Bản không-React, dùng trong test và trong các hàm tiện ích ngoài component */
export function makeContext(
  data: MasterData,
  opts: Partial<Pick<RuleContext, 'now' | 'ignoreIds' | 'actor'>> = {},
): RuleContext {
  return {
    data,
    index: buildScheduleIndex(data),
    now: opts.now ?? new Date().toISOString(),
    ignoreIds: opts.ignoreIds ?? new Set(),
    actor: opts.actor ?? { role: 'admin', id: 'U01' },
  }
}
