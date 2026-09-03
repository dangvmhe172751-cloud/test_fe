import { DownloadOutlined } from '@ant-design/icons'
import { App, Button, Card, Space, Statistic, Tag, Tooltip, Typography } from 'antd'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { fmtMetric } from '@/shared/domain/metrics'
import type { MetricResult } from '@/shared/domain/metrics'
import type { Severity, Violation } from '@/shared/domain/rules/types'

export function PageHeader({
  title,
  subtitle,
  extra,
}: {
  title: string
  subtitle?: ReactNode
  extra?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 16, gap: 16 }}>
      <div style={{ flex: 1 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {subtitle}
          </Typography.Text>
        )}
      </div>
      <Space>{extra}</Space>
    </div>
  )
}

const SEVERITY_COLOR: Record<Severity, string> = {
  error: 'error',
  warning: 'warning',
  info: 'processing',
}
const SEVERITY_TEXT: Record<Severity, string> = {
  error: 'Chặn',
  warning: 'Cảnh báo',
  info: 'Thông tin',
}

export function SeverityTag({ severity }: { severity: Severity }) {
  return <Tag color={SEVERITY_COLOR[severity]}>{SEVERITY_TEXT[severity]}</Tag>
}

export function ViolationList({
  violations,
  empty = 'Không có xung đột',
}: {
  violations: Violation[]
  empty?: string
}) {
  if (!violations.length) {
    return (
      <Typography.Text type="success" style={{ fontSize: 13 }}>
        ✓ {empty}
      </Typography.Text>
    )
  }
  return (
    <Space direction="vertical" size={6} style={{ width: '100%' }}>
      {violations.map((v, i) => (
        <div key={`${v.ruleId}-${v.subjectId}-${i}`} style={{ fontSize: 13, lineHeight: 1.5 }}>
          <Space size={4} align="start">
            <SeverityTag severity={v.severity} />
            <Tag>{v.ruleId}</Tag>
            <span>
              {v.message}
              {v.suggestion && (
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                  → {v.suggestion}
                </Typography.Text>
              )}
            </span>
          </Space>
        </div>
      ))}
    </Space>
  )
}

/** M06 — mọi số trên dashboard phải click được để xem danh sách tạo nên nó */
export function MetricCard({
  metric,
  onDrilldown,
}: {
  metric: MetricResult
  onDrilldown?: (m: MetricResult) => void
}) {
  return (
    <Card
      size="small"
      hoverable={!!onDrilldown}
      onClick={() => onDrilldown?.(metric)}
      styles={{ body: { padding: '12px 16px' } }}
    >
      <Tooltip title={metric.spec.formula}>
        <Statistic
          title={
            <span style={{ fontSize: 13 }}>
              {metric.spec.label}
              {metric.numerator != null && (
                <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                  {metric.numerator}/{metric.denominator}
                </Typography.Text>
              )}
            </span>
          }
          value={fmtMetric(metric)}
          valueStyle={{ fontSize: 24, color: metric.value == null ? '#999' : undefined }}
        />
      </Tooltip>
    </Card>
  )
}

/** Nút xuất Excel dùng chung — tự hiện lỗi nếu EXPORT_RULES chặn */
export function ExportButton({
  onExport,
  label = 'Xuất Excel',
}: {
  onExport: () => Promise<{ ok: boolean; violations: Violation[] }>
  label?: string
}) {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)
  return (
    <Button
      icon={<DownloadOutlined />}
      loading={loading}
      onClick={async () => {
        setLoading(true)
        try {
          const res = await onExport()
          if (!res.ok) {
            const first = res.violations.find((v) => v.severity === 'error')
            message.error(`[${first?.ruleId}] ${first?.message}`)
            return
          }
          const masked = res.violations.find((v) => v.ruleId === 'X01')
          message.success(masked ? `Đã xuất file — ${masked.message}` : 'Đã xuất file Excel')
        } finally {
          setLoading(false)
        }
      }}
    >
      {label}
    </Button>
  )
}
