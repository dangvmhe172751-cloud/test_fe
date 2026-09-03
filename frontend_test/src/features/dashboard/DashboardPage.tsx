import { Card, Col, DatePicker, Drawer, Row, Space, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useRuleContext } from '@/mocks/store'
import { computeMetric, roomUtilizationByRoom, teacherHoursByTeacher } from '@/shared/domain/metrics'
import type { MetricKey, MetricResult, Period } from '@/shared/domain/metrics'
import { validate } from '@/shared/domain/rules/engine'
import { SCHEDULE_RULES } from '@/shared/domain/rules/schedule'
import { addDays, fmtDateVi, fmtMin, startOfWeek, todayStr } from '@/shared/domain/time'
import { exportDashboard, exportRoomUtilization } from '@/shared/export/reports'
import { ExportButton, MetricCard, PageHeader, ViolationList } from '@/shared/ui'

const KEYS: MetricKey[] = [
  'activeStudents',
  'runningClasses',
  'sessionsInPeriod',
  'classFillRate',
  'roomUtilization',
  'openConflicts',
  'waitlistDepth',
  'attendanceRate',
]

export function DashboardPage() {
  const ctx = useRuleContext()
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [
    dayjs(startOfWeek(todayStr())),
    dayjs(addDays(startOfWeek(todayStr()), 7)),
  ])
  const [drill, setDrill] = useState<MetricResult | null>(null)

  // M02 — [from, to) nửa mở, thống nhất với quy ước khoảng thời gian của engine
  const period: Period = useMemo(
    () => ({ from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') }),
    [range],
  )

  const metrics = useMemo(
    () => KEYS.map((k) => computeMetric(k, period, ctx)),
    [period, ctx],
  )
  const roomStats = useMemo(() => roomUtilizationByRoom(period, ctx), [period, ctx])
  const teacherStats = useMemo(
    () => teacherHoursByTeacher(period, ctx).sort((a, b) => b.hours - a.hours),
    [period, ctx],
  )

  const conflictSessions = useMemo(() => {
    const ids = new Set(metrics.find((m) => m.key === 'openConflicts')?.drilldownIds ?? [])
    return ctx.data.sessions
      .filter((s) => ids.has(s.id))
      .map((s) => ({ session: s, violations: validate([s], SCHEDULE_RULES, ctx) }))
  }, [metrics, ctx])

  return (
    <>
      <PageHeader
        title="Tổng quan"
        subtitle={
          <>
            Mọi con số lấy từ metric registry (M01) — click vào thẻ để xem danh sách tạo nên nó
            (M06). Kỳ báo cáo {fmtDateVi(period.from)} đến trước {fmtDateVi(period.to)}.
          </>
        }
        extra={
          <Space>
            <DatePicker.RangePicker
              format="DD/MM/YYYY"
              value={range}
              onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])}
              allowClear={false}
            />
            <ExportButton
              label="Xuất thống kê"
              onExport={() => exportDashboard(ctx, period)}
            />
          </Space>
        }
      />

      <Row gutter={[12, 12]}>
        {metrics.map((m) => (
          <Col key={m.key} xs={12} md={6}>
            <MetricCard metric={m} onDrilldown={setDrill} />
          </Col>
        ))}
      </Row>

      <Row gutter={12} style={{ marginTop: 12 }}>
        <Col span={12}>
          <Card
            size="small"
            title="Tỉ lệ sử dụng phòng"
            extra={<ExportButton label="Xuất" onExport={() => exportRoomUtilization(ctx, period)} />}
          >
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={roomStats.map((r) => ({ ...r, pct: r.rate == null ? 0 : r.rate * 100 }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis unit="%" tick={{ fontSize: 12 }} />
                <RTooltip
                  formatter={(value, _name, item) => {
                    const row = item.payload as (typeof roomStats)[number]
                    return row.rate == null
                      ? ['—', 'Chưa khai giờ mở cửa']
                      : [`${Number(value).toFixed(1)}%`, `${row.usedHours}h / ${row.openHours}h`]
                  }}
                />
                <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                  {roomStats.map((r) => (
                    <Cell
                      key={r.roomId}
                      fill={r.rate == null ? '#d9d9d9' : r.rate > 0.7 ? '#d46b08' : '#1d5fd0'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="Giờ dạy theo giáo viên">
            <Table
              size="small"
              rowKey="teacherId"
              pagination={false}
              scroll={{ y: 210 }}
              dataSource={teacherStats}
              columns={[
                { title: 'Giáo viên', dataIndex: 'name' },
                { title: 'Buổi', dataIndex: 'sessionCount', width: 70 },
                { title: 'Giờ', dataIndex: 'hours', width: 70 },
                {
                  title: 'Giới hạn/tuần',
                  width: 120,
                  render: (_, r) => (
                    <Tag color={r.hours > r.maxHoursPerWeek ? 'warning' : 'default'}>
                      {r.maxHoursPerWeek}h {r.hours > r.maxHoursPerWeek ? '· vượt (R11)' : ''}
                    </Tag>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title={`Xung đột tồn đọng trong kỳ (${conflictSessions.length} buổi)`}
        style={{ marginTop: 12 }}
      >
        {conflictSessions.length === 0 ? (
          <Typography.Text type="success">✓ Không có buổi nào bị xung đột</Typography.Text>
        ) : (
          <Table
            size="small"
            rowKey={(r) => r.session.id}
            dataSource={conflictSessions}
            pagination={false}
            columns={[
              {
                title: 'Buổi',
                width: 260,
                render: (_, r) => (
                  <span>
                    <b>{ctx.data.classGroups.find((c) => c.id === r.session.classGroupId)?.name}</b>{' '}
                    · {fmtDateVi(r.session.date)} {fmtMin(r.session.startMin)}–
                    {fmtMin(r.session.endMin)}
                  </span>
                ),
              },
              {
                title: 'Vi phạm',
                render: (_, r) => <ViolationList violations={r.violations} />,
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={!!drill}
        width={520}
        title={drill?.spec.label}
        onClose={() => setDrill(null)}
      >
        {drill && (
          <>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
              <b>Công thức:</b> {drill.spec.formula}
            </Typography.Paragraph>
            <Typography.Paragraph style={{ fontSize: 13 }}>
              Gồm {drill.drilldownIds.length} bản ghi
              {drill.numerator != null && ` · tử số ${drill.numerator} / mẫu số ${drill.denominator}`}
            </Typography.Paragraph>
            <Table
              size="small"
              rowKey={(id) => id}
              dataSource={drill.drilldownIds}
              pagination={{ pageSize: 20, showSizeChanger: false }}
              columns={[
                { title: 'Mã', dataIndex: undefined, render: (id: string) => id, width: 120 },
                {
                  title: 'Mô tả',
                  render: (id: string) => describeId(id, ctx),
                },
              ]}
            />
          </>
        )}
      </Drawer>
    </>
  )
}

function describeId(id: string, ctx: ReturnType<typeof useRuleContext>): string {
  const student = ctx.data.students.find((s) => s.id === id)
  if (student) return `${student.code} — ${student.fullName}`
  const cls = ctx.data.classGroups.find((c) => c.id === id)
  if (cls) return `Lớp ${cls.name}`
  const room = ctx.data.rooms.find((r) => r.id === id)
  if (room) return `Phòng ${room.name}`
  const session = ctx.data.sessions.find((s) => s.id === id)
  if (session) {
    const name = ctx.data.classGroups.find((c) => c.id === session.classGroupId)?.name
    return `${name} · ${fmtDateVi(session.date)} ${fmtMin(session.startMin)}`
  }
  const enrollment = ctx.data.enrollments.find((e) => e.id === id)
  if (enrollment) {
    const st = ctx.data.students.find((s) => s.id === enrollment.studentId)
    return `Đăng ký của ${st?.fullName} vào ${enrollment.classGroupId}`
  }
  return id
}
