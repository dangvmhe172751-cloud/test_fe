import { PlusOutlined } from '@ant-design/icons'
import { Button, Card, Progress, Space, Table, Tag } from 'antd'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useRuleContext } from '@/mocks/store'
import { effectiveCapacity } from '@/shared/domain/rules/enrollment'
import { validate } from '@/shared/domain/rules/engine'
import { SCHEDULE_RULES } from '@/shared/domain/rules/schedule'
import { fmtDateVi, fmtMin, WEEKDAY_LABEL } from '@/shared/domain/time'
import type { ClassGroup } from '@/shared/domain/types'
import { PageHeader } from '@/shared/ui'

const STATUS: Record<ClassGroup['status'], { text: string; color: string }> = {
  draft: { text: 'Bản nháp', color: 'default' },
  published: { text: 'Đang chạy', color: 'green' },
  finished: { text: 'Đã kết thúc', color: 'blue' },
  cancelled: { text: 'Đã huỷ', color: 'red' },
}

export function ClassesPage() {
  const ctx = useRuleContext()
  const navigate = useNavigate()

  const rows = useMemo(
    () =>
      ctx.data.classGroups.map((cls) => {
        const course = ctx.data.courses.find((c) => c.id === cls.courseId)
        const sessions = ctx.index.byClass.get(cls.id) ?? []
        const conflicts = sessions.filter(
          (s) =>
            s.status === 'scheduled' &&
            validate([s], SCHEDULE_RULES, ctx).some((v) => v.severity === 'error'),
        ).length
        const capacity = effectiveCapacity(ctx, cls, course)
        return {
          cls,
          courseName: course?.name ?? '',
          sessionCount: sessions.length,
          doneCount: sessions.filter((s) => s.status === 'done').length,
          enrolled: (ctx.index.confirmedByClass.get(cls.id) ?? []).length,
          waitlist: (ctx.index.waitlistByClass.get(cls.id) ?? []).length,
          capacity: Number.isFinite(capacity) ? capacity : 0,
          conflicts,
        }
      }),
    [ctx],
  )

  return (
    <>
      <PageHeader
        title="Lớp học"
        subtitle="Mỗi lớp là một lần mở của khóa học, gắn với giáo viên, phòng và mẫu lịch cụ thể"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/classes/new')}>
            Mở lớp mới
          </Button>
        }
      />
      <Card size="small">
        <Table
          size="small"
          rowKey={(r) => r.cls.id}
          dataSource={rows}
          pagination={false}
          columns={[
            { title: 'Lớp', width: 130, render: (_, r) => <b>{r.cls.name}</b> },
            { title: 'Khóa học', render: (_, r) => r.courseName },
            {
              title: 'Lịch',
              width: 180,
              render: (_, r) => (
                <span style={{ fontSize: 12 }}>
                  {r.cls.pattern.weekdays.map((w) => WEEKDAY_LABEL[w]).join(', ')} ·{' '}
                  {fmtMin(r.cls.pattern.startMin)}–{fmtMin(r.cls.pattern.endMin)}
                </span>
              ),
            },
            {
              title: 'Khoảng ngày',
              width: 170,
              render: (_, r) => (
                <span style={{ fontSize: 12 }}>
                  {fmtDateVi(r.cls.startDate)} → {fmtDateVi(r.cls.endDate)}
                </span>
              ),
            },
            {
              title: 'Giáo viên',
              width: 160,
              render: (_, r) =>
                ctx.data.teachers.find((t) => t.id === r.cls.primaryTeacherId)?.fullName,
            },
            {
              title: 'Phòng',
              width: 90,
              render: (_, r) => ctx.data.rooms.find((x) => x.id === r.cls.defaultRoomId)?.name,
            },
            {
              title: 'Sĩ số',
              width: 150,
              render: (_, r) => (
                <Space direction="vertical" size={0} style={{ width: '100%' }}>
                  <span style={{ fontSize: 12 }}>
                    {r.enrolled}/{r.capacity || '—'}
                    {r.waitlist > 0 && (
                      <Tag color="orange" style={{ marginLeft: 6 }}>
                        +{r.waitlist} chờ
                      </Tag>
                    )}
                  </span>
                  {r.capacity > 0 && (
                    <Progress
                      percent={Math.round((r.enrolled / r.capacity) * 100)}
                      size="small"
                      showInfo={false}
                    />
                  )}
                </Space>
              ),
            },
            {
              title: 'Tiến độ',
              width: 100,
              render: (_, r) => `${r.doneCount}/${r.sessionCount} buổi`,
            },
            {
              title: 'Xung đột',
              width: 100,
              render: (_, r) =>
                r.conflicts ? <Tag color="error">{r.conflicts} buổi</Tag> : <Tag color="success">Sạch</Tag>,
            },
            {
              title: 'Trạng thái',
              width: 110,
              render: (_, r) => <Tag color={STATUS[r.cls.status].color}>{STATUS[r.cls.status].text}</Tag>,
            },
          ]}
        />
      </Card>
    </>
  )
}
