import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Drawer,
  Descriptions,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import { useMemo, useState } from 'react'
import { cancelSession, previewSession, saveSession } from '@/mocks/api'
import { useRuleContext } from '@/mocks/store'
import { validate } from '@/shared/domain/rules/engine'
import { SCHEDULE_RULES } from '@/shared/domain/rules/schedule'
import type { Violation } from '@/shared/domain/rules/types'
import { suggestRooms, suggestTeachers } from '@/shared/domain/suggest'
import { addDays, fmtDateVi, fmtMin, startOfWeek, todayStr, weekDates } from '@/shared/domain/time'
import type { ID, Session } from '@/shared/domain/types'
import { exportTimetable } from '@/shared/export/reports'
import { ExportButton, PageHeader, ViolationList } from '@/shared/ui'
import { WeekCalendar } from './WeekCalendar'
import type { DropTarget } from './WeekCalendar'

export function TimetablePage() {
  const { message, modal } = App.useApp()
  const ctx = useRuleContext()
  const [anchor, setAnchor] = useState(() => startOfWeek(todayStr()))
  const [roomFilter, setRoomFilter] = useState<ID | undefined>()
  const [teacherFilter, setTeacherFilter] = useState<ID | undefined>()
  const [selected, setSelected] = useState<Session | null>(null)

  const dates = useMemo(() => weekDates(anchor), [anchor])
  const dateSet = useMemo(() => new Set(dates), [dates])

  const weekSessions = useMemo(
    () =>
      ctx.data.sessions.filter(
        (s) =>
          dateSet.has(s.date) &&
          (!roomFilter || s.roomId === roomFilter) &&
          (!teacherFilter || s.teacherId === teacherFilter),
      ),
    [ctx.data.sessions, dateSet, roomFilter, teacherFilter],
  )

  // Chạy engine 1 lần cho cả tuần, chia theo buổi — không tính lại trong từng ô lịch
  const { violationsBySession, allViolations, highlightIds } = useMemo(() => {
    const map = new Map<ID, Violation[]>()
    const all: Violation[] = []
    const highlight = new Set<ID>()
    for (const s of weekSessions) {
      const v = validate([s], SCHEDULE_RULES, ctx)
      if (v.length) {
        map.set(s.id, v)
        all.push(...v)
        for (const x of v) for (const id of x.conflictWith ?? []) highlight.add(id)
      }
    }
    return { violationsBySession: map, allViolations: all, highlightIds: highlight }
  }, [weekSessions, ctx])

  const errorCount = allViolations.filter((v) => v.severity === 'error').length
  const warnCount = allViolations.filter((v) => v.severity === 'warning').length

  const move = (s: Session, target: DropTarget): Session => ({
    ...s,
    date: target.date,
    startMin: target.startMin,
    endMin: target.startMin + (s.endMin - s.startMin),
  })

  const handleDrop = (s: Session, target: DropTarget) => {
    const next = move(s, target)
    const result = saveSession(next)
    if (!result.ok) {
      const first = result.violations.find((v) => v.severity === 'error')
      message.error(`Không thể chuyển: [${first?.ruleId}] ${first?.message}`)
      return
    }
    const warnings = result.violations.filter((v) => v.severity === 'warning')
    message.success(
      warnings.length
        ? `Đã chuyển buổi — còn ${warnings.length} cảnh báo`
        : 'Đã chuyển buổi học',
    )
  }

  return (
    <>
      <PageHeader
        title="Thời khóa biểu"
        subtitle={
          <>
            Kéo thả để đổi lịch — hệ thống kiểm tra xung đột ngay khi kéo qua ô, chưa ghi dữ liệu.
            Tuần {fmtDateVi(dates[0])} – {fmtDateVi(dates[6])}
          </>
        }
        extra={
          <ExportButton
            onExport={() =>
              exportTimetable(ctx, weekSessions, {
                Tuần: `${fmtDateVi(dates[0])} – ${fmtDateVi(dates[6])}`,
                Phòng: roomFilter ?? 'Tất cả',
                'Giáo viên': teacherFilter
                  ? (ctx.data.teachers.find((t) => t.id === teacherFilter)?.fullName ?? '')
                  : 'Tất cả',
              })
            }
          />
        }
      />

      <Space style={{ marginBottom: 12 }} wrap>
        <Button icon={<LeftOutlined />} onClick={() => setAnchor(addDays(anchor, -7))} />
        <Button onClick={() => setAnchor(startOfWeek(todayStr()))}>Tuần này</Button>
        <Button icon={<RightOutlined />} onClick={() => setAnchor(addDays(anchor, 7))} />
        <Select
          allowClear
          placeholder="Lọc theo phòng"
          style={{ width: 180 }}
          value={roomFilter}
          onChange={setRoomFilter}
          options={ctx.data.rooms.map((r) => ({ value: r.id, label: r.name }))}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Lọc theo giáo viên"
          style={{ width: 220 }}
          value={teacherFilter}
          onChange={setTeacherFilter}
          options={ctx.data.teachers.map((t) => ({ value: t.id, label: t.fullName }))}
        />
        <Tag color={errorCount ? 'error' : 'success'}>{errorCount} xung đột chặn</Tag>
        <Tag color={warnCount ? 'warning' : 'default'}>{warnCount} cảnh báo</Tag>
      </Space>

      <Row gutter={12}>
        <Col flex="auto">
          <WeekCalendar
            anchorDate={anchor}
            sessions={weekSessions}
            ctx={ctx}
            violationsBySession={violationsBySession}
            highlightIds={highlightIds}
            selectedId={selected?.id}
            onSelect={setSelected}
            onDragPreview={(s, target) => previewSession(move(s, target))}
            onDrop={handleDrop}
          />
        </Col>
        <Col flex="330px">
          <Card size="small" title={`Xung đột trong tuần (${allViolations.length})`}>
            <div style={{ maxHeight: 620, overflowY: 'auto' }}>
              <ViolationList violations={allViolations} empty="Tuần này không có xung đột" />
            </div>
          </Card>
        </Col>
      </Row>

      <SessionDrawer
        session={selected}
        onClose={() => setSelected(null)}
        onCancelSession={(s) => {
          modal.confirm({
            title: 'Huỷ buổi học này?',
            content: 'Buổi đã huỷ sẽ được giải phóng khỏi phòng và giáo viên.',
            okText: 'Huỷ buổi',
            cancelText: 'Không',
            onOk: () => {
              cancelSession(s.id, 'Huỷ thủ công')
              setSelected(null)
              message.success('Đã huỷ buổi học')
            },
          })
        }}
      />
    </>
  )
}

function SessionDrawer({
  session,
  onClose,
  onCancelSession,
}: {
  session: Session | null
  onClose: () => void
  onCancelSession: (s: Session) => void
}) {
  const { message } = App.useApp()
  const ctx = useRuleContext(session ? [session.id] : [])
  if (!session) return null

  const violations = validate([session], SCHEDULE_RULES, ctx)
  const cls = ctx.data.classGroups.find((c) => c.id === session.classGroupId)
  const course = ctx.data.courses.find((c) => c.id === cls?.courseId)
  const roomOptions = suggestRooms(session, ctx)
  const teacherOptions = suggestTeachers(session, ctx)
  const enrolled = (ctx.index.confirmedByClass.get(session.classGroupId) ?? []).length

  const apply = (patch: Partial<Session>, label: string) => {
    const res = saveSession({ ...session, ...patch })
    if (!res.ok) {
      const first = res.violations.find((v) => v.severity === 'error')
      Modal.error({ title: 'Không thể lưu', content: `[${first?.ruleId}] ${first?.message}` })
      return
    }
    message.success(label)
    onClose()
  }

  return (
    <Drawer
      open
      width={460}
      title={`${cls?.name ?? ''} — ${fmtDateVi(session.date)}`}
      onClose={onClose}
      extra={
        session.status === 'scheduled' && (
          <Button danger onClick={() => onCancelSession(session)}>
            Huỷ buổi
          </Button>
        )
      }
    >
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Khóa học">{course?.name}</Descriptions.Item>
        <Descriptions.Item label="Thời gian">
          {fmtMin(session.startMin)} – {fmtMin(session.endMin)}
        </Descriptions.Item>
        <Descriptions.Item label="Sĩ số chính thức">{enrolled}</Descriptions.Item>
        <Descriptions.Item label="Trạng thái">
          {{ scheduled: 'Đã xếp', done: 'Đã dạy', cancelled: 'Đã huỷ' }[session.status]}
        </Descriptions.Item>
        {session.note && <Descriptions.Item label="Ghi chú">{session.note}</Descriptions.Item>}
      </Descriptions>

      <Typography.Title level={5} style={{ marginTop: 20 }}>
        Kiểm tra xung đột
      </Typography.Title>
      <ViolationList violations={violations} empty="Buổi này hợp lệ" />

      {session.status === 'scheduled' && (
        <>
          <Typography.Title level={5} style={{ marginTop: 20 }}>
            Đổi phòng
          </Typography.Title>
          {roomOptions.length ? (
            <Space wrap>
              {roomOptions.map((id) => (
                <Button key={id} size="small" onClick={() => apply({ roomId: id }, 'Đã đổi phòng')}>
                  {ctx.data.rooms.find((r) => r.id === id)?.name}
                </Button>
              ))}
            </Space>
          ) : (
            <Alert type="warning" showIcon message="Không có phòng nào trống hợp lệ ở khung giờ này" />
          )}

          <Typography.Title level={5} style={{ marginTop: 20 }}>
            Giáo viên dạy thay
          </Typography.Title>
          {teacherOptions.length ? (
            <Space wrap>
              {teacherOptions.map((id) => (
                <Button
                  key={id}
                  size="small"
                  onClick={() => apply({ teacherId: id }, 'Đã đổi giáo viên')}
                >
                  {ctx.data.teachers.find((t) => t.id === id)?.fullName}
                </Button>
              ))}
            </Space>
          ) : (
            <Alert type="warning" showIcon message="Không có giáo viên nào rảnh ở khung giờ này" />
          )}
        </>
      )}
    </Drawer>
  )
}
