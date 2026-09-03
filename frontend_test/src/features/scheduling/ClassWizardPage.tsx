import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  TimePicker,
  Typography,
} from 'antd'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { buildDraftClass, publishClass, validateDraftClass } from '@/mocks/api'
import { useRuleContext } from '@/mocks/store'
import { groupBySubject } from '@/shared/domain/rules/engine'
import type { Violation } from '@/shared/domain/rules/types'
import { suggestSlots } from '@/shared/domain/suggest'
import { fmtDateVi, fmtMin, todayStr, WEEKDAY_LABEL, weekdayOf } from '@/shared/domain/time'
import type { ClassGroup, Session, Weekday } from '@/shared/domain/types'
import { PageHeader, SeverityTag, ViolationList } from '@/shared/ui'

interface FormValues {
  courseId: string
  name: string
  teacherId: string
  roomId: string
  startDate: Dayjs
  weekdays: Weekday[]
  time: [Dayjs, Dayjs]
  totalSessions: number
}

const WEEKDAY_OPTIONS: Array<{ label: string; value: Weekday }> = [
  { label: 'T2', value: 1 },
  { label: 'T3', value: 2 },
  { label: 'T4', value: 3 },
  { label: 'T5', value: 4 },
  { label: 'T6', value: 5 },
  { label: 'T7', value: 6 },
  { label: 'CN', value: 0 },
]

export function ClassWizardPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const ctx = useRuleContext()
  const [form] = Form.useForm<FormValues>()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<{ cls: ClassGroup; sessions: Session[] } | null>(null)

  const courseId = Form.useWatch('courseId', form)
  const course = ctx.data.courses.find((c) => c.id === courseId)

  const violations = useMemo(
    () => (draft ? validateDraftClass(draft.cls, draft.sessions) : []),
    [draft],
  )
  const bySession = useMemo(() => groupBySubject(violations), [violations])
  const errorCount = violations.filter((v) => v.severity === 'error').length

  const buildPreview = async () => {
    const values = await form.validateFields()
    const built = buildDraftClass(
      {
        courseId: values.courseId,
        name: values.name,
        teacherId: values.teacherId,
        roomId: values.roomId,
        startDate: values.startDate.format('YYYY-MM-DD'),
        weekdays: values.weekdays,
        startMin: values.time[0].hour() * 60 + values.time[0].minute(),
        endMin: values.time[1].hour() * 60 + values.time[1].minute(),
        totalSessions: values.totalSessions,
      },
      ctx,
    )
    setDraft(built)
    setStep(2)
  }

  return (
    <>
      <PageHeader
        title="Mở lớp mới"
        subtitle="Sinh lịch từ mẫu lặp, kiểm tra xung đột từng buổi rồi mới công bố"
        extra={<Button onClick={() => navigate('/classes')}>Quay lại</Button>}
      />

      <Steps
        current={step}
        size="small"
        style={{ marginBottom: 20, maxWidth: 800 }}
        items={[
          { title: 'Chọn khóa học' },
          { title: 'Giáo viên & phòng' },
          { title: 'Kiểm tra lịch' },
        ]}
      />

      <Row gutter={16}>
        <Col span={step === 2 ? 24 : 14}>
          <Card size="small" style={{ display: step === 2 ? 'none' : undefined }}>
            <Form<FormValues>
              form={form}
              layout="vertical"
              initialValues={{
                startDate: dayjs(todayStr()).add(7, 'day'),
                weekdays: [2, 5] as Weekday[],
                time: [dayjs('18:00', 'HH:mm'), dayjs('19:30', 'HH:mm')],
                totalSessions: 24,
              }}
            >
              {step === 0 && (
                <>
                  <Form.Item
                    name="courseId"
                    label="Khóa học"
                    rules={[{ required: true, message: 'Chọn khóa học' }]}
                  >
                    <Select
                      placeholder="Chọn khóa học"
                      options={ctx.data.courses.map((c) => ({
                        value: c.id,
                        label: `${c.code} — ${c.name}`,
                      }))}
                      onChange={(id) => {
                        const c = ctx.data.courses.find((x) => x.id === id)
                        if (!c) return
                        form.setFieldsValue({
                          totalSessions: c.totalSessions,
                          name: `${c.code}.${String(ctx.data.classGroups.length + 1).padStart(2, '0')}`,
                        })
                      }}
                    />
                  </Form.Item>
                  <Form.Item
                    name="name"
                    label="Tên lớp"
                    rules={[{ required: true, message: 'Nhập tên lớp' }]}
                  >
                    <Input placeholder="VD: ENG-A1.04" />
                  </Form.Item>
                  {course && (
                    <Alert
                      type="info"
                      showIcon
                      message={`${course.totalSessions} buổi × ${course.sessionDurationMin} phút · tối đa ${course.maxStudents} HV`}
                      description={
                        <Space direction="vertical" size={2}>
                          <span>
                            Thiết bị yêu cầu:{' '}
                            {course.requiredEquipment.join(', ') || 'không yêu cầu'} (R10)
                          </span>
                          {course.prerequisiteCourseIds.length > 0 && (
                            <span>
                              Khóa tiên quyết:{' '}
                              {course.prerequisiteCourseIds
                                .map(
                                  (id) => ctx.data.courses.find((c) => c.id === id)?.name ?? id,
                                )
                                .join(', ')}{' '}
                              (E06)
                            </span>
                          )}
                        </Space>
                      }
                    />
                  )}
                  <Button
                    type="primary"
                    style={{ marginTop: 16 }}
                    onClick={async () => {
                      await form.validateFields(['courseId', 'name'])
                      setStep(1)
                    }}
                  >
                    Tiếp tục
                  </Button>
                </>
              )}

              {step === 1 && (
                <>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="teacherId" label="Giáo viên" rules={[{ required: true }]}>
                        <Select
                          showSearch
                          optionFilterProp="label"
                          options={ctx.data.teachers.map((t) => ({
                            value: t.id,
                            label:
                              t.fullName +
                              (course && !t.subjectIds.includes(course.subjectId)
                                ? ' (khác chuyên môn — R08)'
                                : ''),
                          }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="roomId" label="Phòng học" rules={[{ required: true }]}>
                        <Select
                          options={ctx.data.rooms.map((r) => ({
                            value: r.id,
                            label: `${r.name} — ${r.capacity} chỗ${
                              r.status === 'maintenance' ? ' (đang bảo trì — R06)' : ''
                            }`,
                          }))}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="startDate" label="Ngày khai giảng" rules={[{ required: true }]}>
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="totalSessions" label="Số buổi" rules={[{ required: true }]}>
                        <InputNumber min={1} max={200} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="weekdays" label="Học vào các thứ" rules={[{ required: true }]}>
                    <Checkbox.Group options={WEEKDAY_OPTIONS} />
                  </Form.Item>
                  <Form.Item name="time" label="Khung giờ" rules={[{ required: true }]}>
                    <TimePicker.RangePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
                  </Form.Item>

                  <SlotSuggestion form={form} ctx={ctx} />

                  <Space style={{ marginTop: 16 }}>
                    <Button onClick={() => setStep(0)}>Quay lại</Button>
                    <Button type="primary" onClick={buildPreview}>
                      Sinh lịch & kiểm tra
                    </Button>
                  </Space>
                </>
              )}
            </Form>
          </Card>

          {step === 2 && draft && (
            <Card
              size="small"
              title={
                <Space>
                  <span>
                    Lịch dự kiến — {draft.sessions.length} buổi ({fmtDateVi(draft.cls.startDate)} →{' '}
                    {fmtDateVi(draft.cls.endDate)})
                  </span>
                  <Tag color={errorCount ? 'error' : 'success'}>
                    {errorCount ? `${errorCount} buổi bị chặn` : 'Không có xung đột chặn'}
                  </Tag>
                </Space>
              }
              extra={
                <Space>
                  <Button onClick={() => setStep(1)}>Sửa lại</Button>
                  <Button
                    type="primary"
                    disabled={errorCount > 0}
                    onClick={() => {
                      const res = publishClass(draft.cls, draft.sessions)
                      if (!res.ok) {
                        message.error('Vẫn còn xung đột chặn, không thể công bố')
                        return
                      }
                      message.success(`Đã mở lớp ${draft.cls.name}`)
                      navigate('/classes')
                    }}
                  >
                    Công bố lớp
                  </Button>
                </Space>
              }
            >
              {errorCount > 0 && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message={`${errorCount} buổi có xung đột phải xử lý trước khi công bố`}
                  description="Sửa khung giờ / phòng / giáo viên ở bước trước, hoặc dùng gợi ý khe trống."
                />
              )}
              <Table<Session>
                size="small"
                rowKey="id"
                dataSource={draft.sessions}
                pagination={{ pageSize: 12, showSizeChanger: false }}
                rowClassName={(s) =>
                  (bySession.get(s.id) ?? []).some((v) => v.severity === 'error') ? 'row-error' : ''
                }
                columns={[
                  {
                    title: '#',
                    width: 50,
                    render: (_, __, i) => i + 1,
                  },
                  {
                    title: 'Ngày',
                    dataIndex: 'date',
                    width: 130,
                    render: (d: string) => `${WEEKDAY_LABEL[weekdayOf(d)]} ${fmtDateVi(d)}`,
                  },
                  {
                    title: 'Giờ',
                    width: 120,
                    render: (_, s) => `${fmtMin(s.startMin)}–${fmtMin(s.endMin)}`,
                  },
                  {
                    title: 'Phòng',
                    width: 100,
                    render: (_, s) => ctx.data.rooms.find((r) => r.id === s.roomId)?.name,
                  },
                  {
                    title: 'Kết quả kiểm tra',
                    render: (_, s) => {
                      const list = bySession.get(s.id) ?? []
                      if (!list.length) return <Tag color="success">Hợp lệ</Tag>
                      return (
                        <Space direction="vertical" size={2}>
                          {list.map((v: Violation, i) => (
                            <span key={i} style={{ fontSize: 12 }}>
                              <SeverityTag severity={v.severity} />
                              <Tag>{v.ruleId}</Tag>
                              {v.message}
                            </span>
                          ))}
                        </Space>
                      )
                    },
                  },
                ]}
              />
              <style>{`.row-error > td { background: #fff1f0 !important; }`}</style>
            </Card>
          )}
        </Col>

        {step !== 2 && (
          <Col span={10}>
            <Card size="small" title="Luật sẽ được áp dụng">
              <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                Khi bấm "Sinh lịch & kiểm tra", toàn bộ buổi học được materialize thành danh sách
                cụ thể rồi chạy qua 14 luật xếp lịch. Hệ thống không so sánh 2 mẫu lặp với nhau.
              </Typography.Paragraph>
              <ViolationList violations={violations} empty="Chưa sinh lịch" />
            </Card>
          </Col>
        )}
      </Row>
    </>
  )
}

/** Gợi ý khe trống = giao của giờ rảnh GV ∩ giờ mở phòng ∩ không buổi nào */
function SlotSuggestion({
  form,
  ctx,
}: {
  form: ReturnType<typeof Form.useForm<FormValues>>[0]
  ctx: ReturnType<typeof useRuleContext>
}) {
  const teacherId = Form.useWatch('teacherId', form)
  const roomId = Form.useWatch('roomId', form)
  const startDate = Form.useWatch('startDate', form)
  const time = Form.useWatch('time', form)

  const slots = useMemo(() => {
    if (!teacherId || !roomId || !startDate || !time?.[0] || !time?.[1]) return []
    const duration =
      time[1].hour() * 60 + time[1].minute() - (time[0].hour() * 60 + time[0].minute())
    if (duration <= 0) return []
    return suggestSlots(
      {
        classGroupId: '__draft__',
        teacherId,
        roomId,
        durationMin: duration,
        fromDate: startDate.format('YYYY-MM-DD'),
        horizonDays: 14,
      },
      ctx,
      6,
    )
  }, [teacherId, roomId, startDate, time, ctx])

  if (!teacherId || !roomId) return null

  return (
    <Alert
      type={slots.length ? 'success' : 'warning'}
      showIcon
      message={slots.length ? 'Khe trống gần nhất cho cặp GV + phòng này' : 'Không tìm thấy khe trống nào trong 14 ngày tới'}
      description={
        slots.length ? (
          <Space wrap>
            {slots.map((s) => (
              <Button
                key={`${s.date}-${s.startMin}`}
                size="small"
                onClick={() =>
                  form.setFieldsValue({
                    startDate: dayjs(s.date),
                    weekdays: [weekdayOf(s.date)],
                    time: [
                      dayjs(fmtMin(s.startMin), 'HH:mm'),
                      dayjs(fmtMin(s.endMin), 'HH:mm'),
                    ],
                  })
                }
              >
                {WEEKDAY_LABEL[weekdayOf(s.date)]} {fmtDateVi(s.date)} · {fmtMin(s.startMin)}
              </Button>
            ))}
          </Space>
        ) : (
          'Thử đổi giáo viên, phòng, hoặc kéo dài khoảng ngày khai giảng.'
        )
      }
    />
  )
}
