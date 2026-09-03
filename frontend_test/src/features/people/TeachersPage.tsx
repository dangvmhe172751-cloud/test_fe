import { Card, Drawer, Space, Table, Tag, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { useRuleContext } from '@/mocks/store'
import { teacherHoursByTeacher } from '@/shared/domain/metrics'
import type { Period } from '@/shared/domain/metrics'
import { addDays, fmtDateVi, fmtMin, startOfWeek, todayStr, WEEKDAY_LABEL } from '@/shared/domain/time'
import type { Teacher } from '@/shared/domain/types'
import { exportTeachers } from '@/shared/export/reports'
import { ExportButton, PageHeader } from '@/shared/ui'

export function TeachersPage() {
  const ctx = useRuleContext()
  const [selected, setSelected] = useState<Teacher | null>(null)

  const period: Period = useMemo(() => {
    const from = startOfWeek(todayStr())
    return { from, to: addDays(from, 7) }
  }, [])

  const load = useMemo(
    () => new Map(teacherHoursByTeacher(period, ctx).map((t) => [t.teacherId, t])),
    [period, ctx],
  )

  return (
    <>
      <PageHeader
        title="Giáo viên"
        subtitle="Giờ rảnh và nghỉ phép khai ở đây chính là dữ liệu luật R07 dùng để chặn xếp lịch"
        extra={
          <ExportButton
            onExport={() =>
              exportTeachers(ctx, ctx.data.teachers, {
                Kỳ: `${fmtDateVi(period.from)} – ${fmtDateVi(period.to)}`,
                __period: JSON.stringify(period),
              })
            }
          />
        }
      />
      <Card size="small">
        <Table<Teacher>
          size="small"
          rowKey="id"
          dataSource={ctx.data.teachers}
          pagination={false}
          onRow={(r) => ({ onClick: () => setSelected(r), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Mã', dataIndex: 'code', width: 90 },
            { title: 'Họ và tên', dataIndex: 'fullName', width: 200 },
            {
              title: 'Chuyên môn',
              render: (_, r) => (
                <Space size={4} wrap>
                  {r.subjectIds.map((id) => (
                    <Tag key={id}>{ctx.data.subjects.find((s) => s.id === id)?.name}</Tag>
                  ))}
                </Space>
              ),
            },
            {
              title: 'Giờ rảnh',
              width: 220,
              render: (_, r) =>
                r.availability.length ? (
                  <span style={{ fontSize: 12 }}>
                    {[...new Set(r.availability.map((a) => WEEKDAY_LABEL[a.weekday]))].join(', ')} ·{' '}
                    {fmtMin(r.availability[0].startMin)}–{fmtMin(r.availability[0].endMin)}
                  </span>
                ) : (
                  <Tag>Chưa khai</Tag>
                ),
            },
            {
              title: 'Giờ dạy tuần này',
              width: 150,
              render: (_, r) => {
                const l = load.get(r.id)
                const over = (l?.hours ?? 0) > r.maxHoursPerWeek
                return (
                  <Tag color={over ? 'warning' : 'default'}>
                    {l?.hours ?? 0}h / {r.maxHoursPerWeek}h
                  </Tag>
                )
              },
            },
            {
              title: 'Nghỉ phép',
              width: 110,
              render: (_, r) =>
                r.leaves.length ? <Tag color="orange">{r.leaves.length} đợt</Tag> : '—',
            },
          ]}
        />
      </Card>

      <Drawer
        open={!!selected}
        width={520}
        title={selected?.fullName}
        onClose={() => setSelected(null)}
      >
        {selected && <TeacherDetail teacher={selected} />}
      </Drawer>
    </>
  )
}

function TeacherDetail({ teacher }: { teacher: Teacher }) {
  const ctx = useRuleContext()
  const sessions = ctx.data.sessions
    .filter((s) => s.teacherId === teacher.id && s.status !== 'cancelled')
    .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1))

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <div>
        <Typography.Text type="secondary">
          {teacher.code} · {teacher.email} · {teacher.phone}
        </Typography.Text>
      </div>

      <Card size="small" title="Khung giờ rảnh (R07)">
        <Table
          size="small"
          rowKey={(r) => `${r.weekday}-${r.startMin}`}
          pagination={false}
          dataSource={teacher.availability}
          columns={[
            { title: 'Thứ', width: 70, render: (_, r) => WEEKDAY_LABEL[r.weekday] },
            { title: 'Từ', width: 80, render: (_, r) => fmtMin(r.startMin) },
            { title: 'Đến', width: 80, render: (_, r) => fmtMin(r.endMin) },
          ]}
        />
      </Card>

      {teacher.leaves.length > 0 && (
        <Card size="small" title="Nghỉ phép">
          {teacher.leaves.map((l, i) => (
            <div key={i} style={{ fontSize: 13 }}>
              {fmtDateVi(l.from)} → {fmtDateVi(l.to)}: {l.reason}
            </div>
          ))}
        </Card>
      )}

      <Card size="small" title={`Lịch dạy (${sessions.length} buổi)`}>
        <Table
          size="small"
          rowKey="id"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          dataSource={sessions}
          columns={[
            { title: 'Ngày', width: 110, render: (_, r) => fmtDateVi(r.date) },
            { title: 'Giờ', width: 110, render: (_, r) => `${fmtMin(r.startMin)}–${fmtMin(r.endMin)}` },
            {
              title: 'Lớp',
              render: (_, r) => ctx.data.classGroups.find((c) => c.id === r.classGroupId)?.name,
            },
            {
              title: 'Phòng',
              width: 80,
              render: (_, r) => ctx.data.rooms.find((x) => x.id === r.roomId)?.name,
            },
          ]}
        />
      </Card>
    </Space>
  )
}
