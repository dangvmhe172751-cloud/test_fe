import { Card, Space, Table, Tag } from 'antd'
import { useRuleContext } from '@/mocks/store'
import type { Course } from '@/shared/domain/types'
import { PageHeader } from '@/shared/ui'

export function CoursesPage() {
  const ctx = useRuleContext()

  return (
    <>
      <PageHeader
        title="Khóa học"
        subtitle="Khóa học là template. Mỗi lần mở lớp sẽ sinh ra ClassGroup rồi materialize thành danh sách buổi học cụ thể."
      />
      <Card size="small">
        <Table<Course>
          size="small"
          rowKey="id"
          dataSource={ctx.data.courses}
          pagination={false}
          columns={[
            { title: 'Mã', dataIndex: 'code', width: 110 },
            { title: 'Tên khóa học', dataIndex: 'name', width: 240 },
            {
              title: 'Môn',
              width: 130,
              render: (_, r) => ctx.data.subjects.find((s) => s.id === r.subjectId)?.name,
            },
            {
              title: 'Cấu trúc',
              width: 150,
              render: (_, r) => `${r.totalSessions} buổi × ${r.sessionDurationMin}′`,
            },
            { title: 'Tối đa', dataIndex: 'maxStudents', width: 80 },
            {
              title: 'Thiết bị yêu cầu (R10)',
              render: (_, r) =>
                r.requiredEquipment.length ? (
                  <Space size={4} wrap>
                    {r.requiredEquipment.map((e) => (
                      <Tag key={e}>{e}</Tag>
                    ))}
                  </Space>
                ) : (
                  '—'
                ),
            },
            {
              title: 'Tiên quyết (E06)',
              width: 190,
              render: (_, r) =>
                r.prerequisiteCourseIds.length
                  ? r.prerequisiteCourseIds
                      .map((id) => ctx.data.courses.find((c) => c.id === id)?.code ?? id)
                      .join(', ')
                  : '—',
            },
            {
              title: 'Đầu vào (E07)',
              width: 140,
              render: (_, r) =>
                [r.minAge ? `từ ${r.minAge} tuổi` : null, r.requiredLevel].filter(Boolean).join(' · ') ||
                '—',
            },
            {
              title: 'Học phí',
              width: 120,
              align: 'right',
              render: (_, r) => r.tuition.toLocaleString('vi-VN') + ' ₫',
            },
            {
              title: 'Số lớp',
              width: 80,
              render: (_, r) => ctx.data.classGroups.filter((c) => c.courseId === r.id).length,
            },
          ]}
        />
      </Card>
    </>
  )
}
