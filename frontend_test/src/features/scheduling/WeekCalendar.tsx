import { Tooltip } from 'antd'
import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'
import type { RuleContext, Violation } from '@/shared/domain/rules/types'
import { fmtMin, WEEKDAY_LABEL, weekDates, weekdayOf } from '@/shared/domain/time'
import type { DateStr, ID, Session } from '@/shared/domain/types'

const DAY_START = 7 * 60
const DAY_END = 22 * 60
const SLOT_MIN = 30
const ROW_H = 22
const ROWS = (DAY_END - DAY_START) / SLOT_MIN

export interface DropTarget {
  date: DateStr
  startMin: number
}

interface Props {
  anchorDate: DateStr
  sessions: Session[]
  ctx: RuleContext
  /** map sessionId -> vi phạm, dựng sẵn ở tầng trên để không tính lại mỗi lần render ô */
  violationsBySession: Map<ID, Violation[]>
  /** id các buổi đang bị highlight vì là "phía bên kia" của một xung đột */
  highlightIds?: Set<ID>
  selectedId?: ID
  onSelect: (s: Session) => void
  /** trả về vi phạm để hiện ngay khi kéo qua ô — dry-run, chưa ghi */
  onDragPreview: (s: Session, target: DropTarget) => Violation[]
  onDrop: (s: Session, target: DropTarget) => void
}

const severityStyle = (violations: Violation[]): CSSProperties => {
  if (violations.some((v) => v.severity === 'error')) {
    return { background: '#fff1f0', borderColor: '#ff4d4f', color: '#a8071a' }
  }
  if (violations.some((v) => v.severity === 'warning')) {
    return { background: '#fff7e6', borderColor: '#fa8c16', color: '#873800' }
  }
  return { background: '#e6f4ff', borderColor: '#69b1ff', color: '#003eb3' }
}

export function WeekCalendar(props: Props) {
  const { anchorDate, sessions, ctx, violationsBySession, highlightIds, selectedId } = props
  const dates = useMemo(() => weekDates(anchorDate), [anchorDate])
  const [dragging, setDragging] = useState<Session | null>(null)
  const [hover, setHover] = useState<{ target: DropTarget; violations: Violation[] } | null>(null)

  const byDate = useMemo(() => {
    const map = new Map<DateStr, Session[]>()
    for (const s of sessions) {
      const arr = map.get(s.date) ?? []
      arr.push(s)
      map.set(s.date, arr)
    }
    return map
  }, [sessions])

  const label = (s: Session) => {
    const cls = ctx.data.classGroups.find((c) => c.id === s.classGroupId)
    const room = ctx.data.rooms.find((r) => r.id === s.roomId)
    const teacher = ctx.data.teachers.find((t) => t.id === s.teacherId)
    return { cls: cls?.name ?? s.classGroupId, room: room?.name ?? '', teacher: teacher?.fullName ?? '' }
  }

  return (
    <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 8 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `56px repeat(7, minmax(140px, 1fr))`,
          minWidth: 1040,
        }}
      >
        {/* hàng tiêu đề */}
        <div style={headerCell} />
        {dates.map((d) => (
          <div key={d} style={{ ...headerCell, fontWeight: 600 }}>
            {WEEKDAY_LABEL[weekdayOf(d)]}
            <span style={{ fontWeight: 400, color: '#888', marginLeft: 6, fontSize: 12 }}>
              {d.slice(8)}/{d.slice(5, 7)}
            </span>
          </div>
        ))}

        {/* cột giờ */}
        <div style={{ position: 'relative', height: ROWS * ROW_H, borderRight: '1px solid #eee' }}>
          {Array.from({ length: ROWS }, (_, i) => {
            const min = DAY_START + i * SLOT_MIN
            return (
              <div
                key={min}
                style={{
                  height: ROW_H,
                  fontSize: 11,
                  color: '#999',
                  textAlign: 'right',
                  paddingRight: 6,
                  borderTop: min % 60 === 0 ? '1px solid #eee' : 'none',
                }}
              >
                {min % 60 === 0 ? fmtMin(min) : ''}
              </div>
            )
          })}
        </div>

        {/* 7 cột ngày */}
        {dates.map((date) => (
          <div
            key={date}
            style={{ position: 'relative', height: ROWS * ROW_H, borderRight: '1px solid #eee' }}
          >
            {/* lưới ô thả */}
            {Array.from({ length: ROWS }, (_, i) => {
              const startMin = DAY_START + i * SLOT_MIN
              const isHover =
                hover?.target.date === date && hover.target.startMin === startMin && dragging
              const blocked = isHover && hover.violations.some((v) => v.severity === 'error')
              return (
                <div
                  key={startMin}
                  onDragOver={(e) => {
                    if (!dragging) return
                    e.preventDefault()
                    const target = { date, startMin }
                    if (hover?.target.date === date && hover.target.startMin === startMin) return
                    setHover({ target, violations: props.onDragPreview(dragging, target) })
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragging) props.onDrop(dragging, { date, startMin })
                    setDragging(null)
                    setHover(null)
                  }}
                  style={{
                    height: ROW_H,
                    borderTop: startMin % 60 === 0 ? '1px solid #f0f0f0' : '1px dashed #fafafa',
                    background: isHover ? (blocked ? '#ffccc7' : '#d9f7be') : undefined,
                  }}
                />
              )
            })}

            {/* các buổi học */}
            {laneLayout(byDate.get(date) ?? []).map(({ session: s, lane, lanes }) => {
              const violations = violationsBySession.get(s.id) ?? []
              const info = label(s)
              const isHighlight = highlightIds?.has(s.id)
              const top = ((s.startMin - DAY_START) / SLOT_MIN) * ROW_H
              const height = Math.max(((s.endMin - s.startMin) / SLOT_MIN) * ROW_H - 2, 18)
              return (
                <Tooltip
                  key={s.id}
                  title={
                    <div style={{ fontSize: 12 }}>
                      <div>
                        <b>{info.cls}</b> · {fmtMin(s.startMin)}–{fmtMin(s.endMin)}
                      </div>
                      <div>
                        {info.teacher} · {info.room}
                      </div>
                      {violations.map((v, i) => (
                        <div key={i} style={{ marginTop: 4 }}>
                          [{v.ruleId}] {v.message}
                        </div>
                      ))}
                    </div>
                  }
                >
                  <div
                    draggable={s.status === 'scheduled'}
                    onDragStart={() => setDragging(s)}
                    onDragEnd={() => {
                      setDragging(null)
                      setHover(null)
                    }}
                    onClick={() => props.onSelect(s)}
                    style={{
                      position: 'absolute',
                      top,
                      height,
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                      border: '1px solid',
                      borderRadius: 4,
                      padding: '2px 5px',
                      fontSize: 11,
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      cursor: s.status === 'scheduled' ? 'grab' : 'not-allowed',
                      opacity: s.status === 'cancelled' ? 0.45 : 1,
                      textDecoration: s.status === 'cancelled' ? 'line-through' : undefined,
                      outline: selectedId === s.id ? '2px solid #1d5fd0' : undefined,
                      boxShadow: isHighlight ? '0 0 0 2px #ff4d4f inset' : undefined,
                      ...severityStyle(violations),
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{info.cls}</div>
                    <div>
                      {fmtMin(s.startMin)} · {info.room}
                    </div>
                    {height > 44 && <div style={{ opacity: 0.8 }}>{info.teacher}</div>}
                  </div>
                </Tooltip>
              )
            })}
          </div>
        ))}
      </div>

      {hover && dragging && (
        <div
          style={{
            padding: '8px 12px',
            borderTop: '1px solid #eee',
            fontSize: 12,
            background: hover.violations.some((v) => v.severity === 'error') ? '#fff1f0' : '#f6ffed',
          }}
        >
          <b>
            Thả vào {hover.target.date} lúc {fmtMin(hover.target.startMin)}:
          </b>{' '}
          {hover.violations.length
            ? hover.violations.map((v) => `[${v.ruleId}] ${v.message}`).join(' · ')
            : 'hợp lệ'}
        </div>
      )}
    </div>
  )
}

const headerCell: CSSProperties = {
  padding: '8px 6px',
  borderBottom: '1px solid #eee',
  borderRight: '1px solid #eee',
  fontSize: 13,
  textAlign: 'center',
}

/**
 * Xếp làn cho các buổi trùng giờ trong cùng một ngày để chúng nằm cạnh nhau
 * thay vì đè lên nhau — đây chính là lúc người dùng nhìn thấy xung đột.
 */
function laneLayout(sessions: Session[]) {
  const sorted = [...sessions].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  const laneEnd: number[] = []
  const assigned = sorted.map((session) => {
    let lane = laneEnd.findIndex((end) => end <= session.startMin)
    if (lane === -1) {
      lane = laneEnd.length
      laneEnd.push(session.endMin)
    } else {
      laneEnd[lane] = session.endMin
    }
    return { session, lane }
  })
  const lanes = Math.max(1, laneEnd.length)
  return assigned.map((a) => ({ ...a, lanes }))
}
