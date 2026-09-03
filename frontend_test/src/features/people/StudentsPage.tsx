import { Card, Drawer, Input, Select, Space, Table, Tag, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { useRuleContext } from '@/mocks/store'
import { fmtDateVi, fmtMin } from '@/shared/domain/time'
import type { Student } from '@/shared/domain/types'
import { exportStudents } from '@/shared/export/reports'
import { ExportButton, PageHeader } from '@/shared/ui'

const STATUS: Record<Student['status'], { text: string; color: string }> = {
  active: { text: 'Đang học', color: 'green' },
  paused: { text: 'Tạm dừng', color: 'default' },
  debt: { text: 'Nợ học phí', color: 'red' },
  graduated: { text: 'Đã tốt nghiệp', color: 'blue' },
}

export function StudentsPage() {
  const ctx = useRuleContext()
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<Student['status'] | undefined>()
  const [selected, setSelected] = useState<Student | null>(null)

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return ctx.data.students.filter(
      (s) =>
        (!status || s.status === status) &&
        (!kw || s.fullName.toLowerCase().includes(kw) || s.code.toLowerCase().includes(kw)),
    )
  }, [ctx.data.students, keyword, status])

  const masked = ctx.actor.role !== 'admin' && ctx.actor.role !== 'academic'

  return (
    <>
      <PageHeader
        title="Học viên"
        subtitle={
          masked
            ? 'Vai trò hiện tại không được xem SĐT phụ huynh — cột này sẽ bị che khi xuất file (X01)'
            : 'Trạng thái "Nợ học phí" và "Tạm dừng" sẽ bị luật E08 chặn khi đăng ký lớp'
        }
        extra={
          <ExportButton
            onExport={() =>
              exportStudents(ctx, rows, {
                'Từ khóa': keyword || '(không)',
                'Trạng thái': status ? STATUS[status].text : 'Tất cả',
              })
            }
          />
        }
      />
      <Card size="small">
        <Space style={{ marginBottom: 12 }}>
          <Input.Search
            allowClear
            placeholder="Tìm theo tên hoặc mã học viên"
            style={{ width: 280 }}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Select
            allowClear
            placeholder="Trạng thái"
            style={{ width: 160 }}
            value={status}
            onChange={setStatus}
            options={Object.entries(STATUS).map(([value, v]) => ({ value, label: v.text }))}
          />
          <Typography.Text type="secondary">{rows.length} học viên</Typography.Text>
        </Space>
        <Table<Student>
          size="small"
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 15, showSizeChanger: false }}
          onRow={(r) => ({ onClick: () => setSelected(r), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Mã HV', dataIndex: 'code', width: 110 },
            { title: 'Họ và tên', dataIndex: 'fullName', width: 200 },
            { title: 'Ngày sinh', width: 110, render: (_, r) => fmtDateVi(r.dob) },
            { title: 'Trình độ', dataIndex: 'level', width: 90 },
            { title: 'Phụ huynh', render: (_, r) => r.guardian.name },
            {
              title: 'SĐT phụ huynh',
              width: 140,
              render: (_, r) => (masked ? '098****321' : r.guardian.phone),
            },
            {
              title: 'Lớp đang học',
              width: 110,
              render: (_, r) =>
                (ctx.index.enrollmentsByStudent.get(r.id) ?? []).filter(
                  (e) => e.status === 'confirmed',
                ).length,
            },
            {
              title: 'Trạng thái',
              width: 130,
              render: (_, r) => <Tag color={STATUS[r.status].color}>{STATUS[r.status].text}</Tag>,
            },
          ]}
        />
      </Card>

      <Drawer
        open={!!selected}
        width={560}
        title={selected?.fullName}
        onClose={() => setSelected(null)}
      >
        {selected && <StudentDetail student={selected} />}
      </Drawer>
    </>
  )
}

function StudentDetail({ student }: { student: Student }) {
  const ctx = useRuleContext()
  const enrollments = ctx.index.enrollmentsByStudent.get(student.id) ?? []
  const classIds = new Set(
    enrollments.filter((e) => e.status === 'confirmed').map((e) => e.classGroupId),
  )
  const sessions = ctx.data.sessions
    .filter((s) => classIds.has(s.classGroupId) && s.status === 'scheduled')
    .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1))
    .slice(0, 20)

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Typography.Text type="secondary">
        {student.code} · sinh {fmtDateVi(student.dob)} · trình độ {student.level ?? '—'} · PH:{' '}
        {student.guardian.name}
      </Typography.Text>

      <Card size="small" title="Đăng ký">
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={enrollments}
          columns={[
            {
              title: 'Lớp',
              render: (_, r) => ctx.data.classGroups.find((c) => c.id === r.classGroupId)?.name,
            },
            { title: 'Trạng thái', width: 130, dataIndex: 'status' },
            {
              title: 'Ngày ĐK',
              width: 110,
              render: (_, r) => fmtDateVi(r.createdAt.slice(0, 10)),
            },
          ]}
        />
      </Card>

      <Card size="small" title="Lịch học sắp tới (nguồn dữ liệu của luật E05 / R03)">
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          scroll={{ y: 280 }}
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
