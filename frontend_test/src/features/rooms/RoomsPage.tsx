import { Card, Progress, Space, Table, Tag } from 'antd'
import { useMemo } from 'react'
import { useRuleContext } from '@/mocks/store'
import { roomUtilizationByRoom } from '@/shared/domain/metrics'
import type { Period } from '@/shared/domain/metrics'
import { addDays, fmtDateVi, fmtMin, startOfWeek, todayStr, WEEKDAY_LABEL } from '@/shared/domain/time'
import type { Room } from '@/shared/domain/types'
import { exportRoomUtilization } from '@/shared/export/reports'
import { ExportButton, PageHeader } from '@/shared/ui'

export function RoomsPage() {
  const ctx = useRuleContext()
  const period: Period = useMemo(() => {
    const from = startOfWeek(todayStr())
    return { from, to: addDays(from, 7) }
  }, [])
  const util = useMemo(
    () => new Map(roomUtilizationByRoom(period, ctx).map((r) => [r.roomId, r])),
    [period, ctx],
  )

  return (
    <>
      <PageHeader
        title="Phòng học"
        subtitle="Sức chứa nuôi luật R04, thiết bị nuôi R10, giờ mở cửa nuôi R05, lịch bảo trì nuôi R06"
        extra={<ExportButton onExport={() => exportRoomUtilization(ctx, period)} />}
      />
      <Card size="small">
        <Table<Room>
          size="small"
          rowKey="id"
          dataSource={ctx.data.rooms}
          pagination={false}
          columns={[
            { title: 'Phòng', dataIndex: 'name', width: 160 },
            { title: 'Sức chứa', dataIndex: 'capacity', width: 90 },
            {
              title: 'Thiết bị',
              render: (_, r) =>
                r.equipment.length ? (
                  <Space size={4} wrap>
                    {r.equipment.map((e) => (
                      <Tag key={e}>{e}</Tag>
                    ))}
                  </Space>
                ) : (
                  <Tag color="default">Không có</Tag>
                ),
            },
            {
              title: 'Giờ mở cửa',
              width: 200,
              render: (_, r) =>
                r.openHours.length ? (
                  <span style={{ fontSize: 12 }}>
                    {[...new Set(r.openHours.map((o) => WEEKDAY_LABEL[o.weekday]))].join(',')} ·{' '}
                    {fmtMin(r.openHours[0].startMin)}–{fmtMin(r.openHours[0].endMin)}
                  </span>
                ) : (
                  '—'
                ),
            },
            {
              title: 'Sử dụng tuần này',
              width: 200,
              render: (_, r) => {
                const u = util.get(r.id)
                if (!u || u.rate == null) return <span style={{ color: '#999' }}>—</span>
                return (
                  <Space direction="vertical" size={0} style={{ width: '100%' }}>
                    <span style={{ fontSize: 12 }}>
                      {u.usedHours}h / {u.openHours}h
                    </span>
                    <Progress
                      percent={Math.round(u.rate * 100)}
                      size="small"
                      status={u.rate > 0.7 ? 'exception' : 'normal'}
                    />
                  </Space>
                )
              },
            },
            {
              title: 'Trạng thái',
              width: 200,
              render: (_, r) => (
                <Space direction="vertical" size={2}>
                  <Tag color={r.status === 'available' ? 'green' : 'red'}>
                    {r.status === 'available' ? 'Sẵn sàng' : 'Đang bảo trì'}
                  </Tag>
                  {r.blackouts.map((b, i) => (
                    <span key={i} style={{ fontSize: 11, color: '#d46b08' }}>
                      {fmtDateVi(b.from)}: {b.reason}
                    </span>
                  ))}
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </>
  )
}
