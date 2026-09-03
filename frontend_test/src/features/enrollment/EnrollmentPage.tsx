import { App, Alert, Button, Card, Col, Modal, Row, Select, Space, Table, Tabs, Tag } from 'antd'
import { useMemo, useState } from 'react'
import { confirmPayment, enroll, promoteWaitlist, transferClass, withdraw } from '@/mocks/api'
import { useRuleContext } from '@/mocks/store'
import { validate } from '@/shared/domain/rules/engine'
import { ENROLLMENT_RULES, effectiveCapacity } from '@/shared/domain/rules/enrollment'
import type { Violation } from '@/shared/domain/rules/types'
import { fmtDateVi, fmtMin, WEEKDAY_LABEL } from '@/shared/domain/time'
import type { Enrollment, EnrollmentStatus, ID } from '@/shared/domain/types'
import { exportEnrollments } from '@/shared/export/reports'
import { ExportButton, PageHeader, ViolationList } from '@/shared/ui'

const STATUS: Record<EnrollmentStatus, { text: string; color: string }> = {
  pending: { text: 'Chờ học phí', color: 'gold' },
  confirmed: { text: 'Chính thức', color: 'green' },
  waitlisted: { text: 'Hàng chờ', color: 'orange' },
  withdrawn: { text: 'Đã rút', color: 'default' },
  transferred: { text: 'Đã chuyển', color: 'default' },
}

export function EnrollmentPage() {
  const { message, modal } = App.useApp()
  const ctx = useRuleContext()
  const [classFilter, setClassFilter] = useState<ID | undefined>()
  const [studentId, setStudentId] = useState<ID | undefined>()
  const [targetClassId, setTargetClassId] = useState<ID | undefined>()

  const rows = useMemo(
    () =>
      ctx.data.enrollments.filter((e) => !classFilter || e.classGroupId === classFilter),
    [ctx.data.enrollments, classFilter],
  )

  /** Dry-run: chạy đủ E01–E10 trước khi người dùng bấm nút */
  const precheck: Violation[] = useMemo(() => {
    if (!studentId || !targetClassId) return []
    const candidate: Enrollment = {
      id: '__preview__',
      studentId,
      classGroupId: targetClassId,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    }
    return validate([candidate], ENROLLMENT_RULES, ctx)
  }, [studentId, targetClassId, ctx])

  const blockers = precheck.filter((v) => v.severity === 'error')
  const onlyFull = blockers.length > 0 && blockers.every((v) => v.ruleId === 'E04')
  const canEnroll = !!studentId && !!targetClassId && (blockers.length === 0 || onlyFull)

  const publishedClasses = ctx.data.classGroups.filter((c) => c.status === 'published')

  const classLabel = (id: ID) => ctx.data.classGroups.find((c) => c.id === id)?.name ?? id
  const studentLabel = (id: ID) => ctx.data.students.find((s) => s.id === id)?.fullName ?? id

  const doEnroll = (tuitionPaid: boolean) => {
    if (!studentId || !targetClassId) return
    const res = enroll(studentId, targetClassId, { tuitionPaid })
    if (!res.ok) {
      const first = res.violations.find((v) => v.severity === 'error')
      message.error(`[${first?.ruleId}] ${first?.message}`)
      return
    }
    if (res.finalStatus === 'waitlisted') {
      message.warning('Lớp đã đầy — đã xếp học viên vào hàng chờ (E04)')
    } else if (res.finalStatus === 'pending') {
      message.success(
        `Đã giữ chỗ ${ctx.data.settings.enrollmentHoldHours}h chờ xác nhận học phí (E10)`,
      )
    } else {
      message.success('Đã ghi danh chính thức')
    }
    setStudentId(undefined)
  }

  return (
    <>
      <PageHeader
        title="Đăng ký học"
        subtitle="Mọi đăng ký chạy qua 12 luật trước khi ghi. Chỉ trạng thái 'Chính thức' mới tính vào sĩ số."
        extra={
          <ExportButton
            onExport={() =>
              exportEnrollments(ctx, rows, { Lớp: classFilter ? classLabel(classFilter) : 'Tất cả' })
            }
          />
        }
      />

      <Row gutter={16}>
        <Col span={9}>
          <Card size="small" title="Ghi danh học viên vào lớp">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Select
                showSearch
                allowClear
                optionFilterProp="label"
                placeholder="Chọn học viên"
                style={{ width: '100%' }}
                value={studentId}
                onChange={setStudentId}
                options={ctx.data.students.map((s) => ({
                  value: s.id,
                  label: `${s.code} — ${s.fullName}${s.status !== 'active' ? ` (${s.status})` : ''}`,
                }))}
              />
              <Select
                showSearch
                allowClear
                optionFilterProp="label"
                placeholder="Chọn lớp"
                style={{ width: '100%' }}
                value={targetClassId}
                onChange={setTargetClassId}
                options={publishedClasses.map((c) => {
                  const course = ctx.data.courses.find((x) => x.id === c.courseId)
                  const cap = effectiveCapacity(ctx, c, course)
                  const taken = (ctx.index.confirmedByClass.get(c.id) ?? []).length
                  return {
                    value: c.id,
                    label: `${c.name} — ${taken}/${cap} chỗ · ${c.pattern.weekdays
                      .map((w) => WEEKDAY_LABEL[w])
                      .join(',')} ${fmtMin(c.pattern.startMin)}`,
                  }
                })}
              />

              {studentId && targetClassId && (
                <Card size="small" type="inner" title="Kết quả kiểm tra trước khi ghi">
                  <ViolationList violations={precheck} empty="Đủ điều kiện đăng ký" />
                </Card>
              )}

              {onlyFull && (
                <Alert
                  type="warning"
                  showIcon
                  message="Lớp đã đầy — hệ thống sẽ xếp vào hàng chờ thay vì từ chối"
                />
              )}

              <Space>
                <Button type="primary" disabled={!canEnroll} onClick={() => doEnroll(true)}>
                  Ghi danh (đã đóng học phí)
                </Button>
                <Button disabled={!canEnroll} onClick={() => doEnroll(false)}>
                  Giữ chỗ chờ học phí
                </Button>
              </Space>
            </Space>
          </Card>

          <Card size="small" title="Hàng chờ theo lớp" style={{ marginTop: 12 }}>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={publishedClasses
                .map((c) => ({
                  id: c.id,
                  name: c.name,
                  queue: (ctx.index.waitlistByClass.get(c.id) ?? []).length,
                  free:
                    effectiveCapacity(ctx, c, ctx.data.courses.find((x) => x.id === c.courseId)) -
                    (ctx.index.confirmedByClass.get(c.id) ?? []).length,
                }))
                .filter((r) => r.queue > 0)}
              locale={{ emptyText: 'Không có lớp nào đang có hàng chờ' }}
              columns={[
                { title: 'Lớp', dataIndex: 'name' },
                { title: 'Đang chờ', dataIndex: 'queue', width: 90 },
                { title: 'Chỗ trống', dataIndex: 'free', width: 90 },
                {
                  title: '',
                  width: 130,
                  render: (_, r) => (
                    <Button
                      size="small"
                      disabled={r.free <= 0}
                      onClick={() => {
                        const res = promoteWaitlist(r.id)
                        if (res.ok) message.success('Đã chuyển người đầu hàng chờ thành chính thức')
                        else message.error('Không đủ điều kiện chuyển (E04/E05)')
                      }}
                    >
                      Nhận 1 người
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
        </Col>

        <Col span={15}>
          <Card size="small">
            <Tabs
              size="small"
              tabBarExtraContent={
                <Select
                  allowClear
                  size="small"
                  placeholder="Lọc theo lớp"
                  style={{ width: 180 }}
                  value={classFilter}
                  onChange={setClassFilter}
                  options={ctx.data.classGroups.map((c) => ({ value: c.id, label: c.name }))}
                />
              }
              items={(
                [
                  ['all', 'Tất cả'],
                  ['confirmed', 'Chính thức'],
                  ['pending', 'Chờ học phí'],
                  ['waitlisted', 'Hàng chờ'],
                ] as const
              ).map(([key, label]) => ({
                key,
                label,
                children: (
                  <Table<Enrollment>
                    size="small"
                    rowKey="id"
                    dataSource={key === 'all' ? rows : rows.filter((r) => r.status === key)}
                    pagination={{ pageSize: 12, showSizeChanger: false }}
                    columns={[
                      { title: 'Học viên', render: (_, r) => studentLabel(r.studentId) },
                      { title: 'Lớp', width: 120, render: (_, r) => classLabel(r.classGroupId) },
                      {
                        title: 'Trạng thái',
                        width: 130,
                        render: (_, r) => (
                          <Tag color={STATUS[r.status].color}>
                            {STATUS[r.status].text}
                            {r.waitlistPosition ? ` #${r.waitlistPosition}` : ''}
                          </Tag>
                        ),
                      },
                      {
                        title: 'Ngày ĐK',
                        width: 110,
                        render: (_, r) => fmtDateVi(r.createdAt.slice(0, 10)),
                      },
                      {
                        title: '',
                        width: 210,
                        render: (_, r) => (
                          <Space size={4}>
                            {r.status === 'pending' && (
                              <Button
                                size="small"
                                type="link"
                                onClick={() => {
                                  const res = confirmPayment(r.id)
                                  if (res.ok) message.success('Đã xác nhận học phí')
                                  else
                                    message.error(
                                      res.violations.find((v) => v.severity === 'error')?.message,
                                    )
                                }}
                              >
                                Xác nhận
                              </Button>
                            )}
                            {(r.status === 'confirmed' || r.status === 'pending') && (
                              <>
                                <Button
                                  size="small"
                                  type="link"
                                  onClick={() =>
                                    openTransfer(r, ctx, modal, message)
                                  }
                                >
                                  Chuyển lớp
                                </Button>
                                <Button
                                  size="small"
                                  type="link"
                                  danger
                                  onClick={() => {
                                    const res = withdraw(r.id)
                                    const warn = res.violations.find((v) => v.ruleId === 'E12')
                                    message[warn ? 'warning' : 'success'](
                                      warn ? warn.message : 'Đã rút lớp',
                                    )
                                  }}
                                >
                                  Rút
                                </Button>
                              </>
                            )}
                          </Space>
                        ),
                      },
                    ]}
                  />
                ),
              }))}
            />
          </Card>
        </Col>
      </Row>
    </>
  )
}

/** E11 — chọn lớp đích, kiểm tra đích trước rồi mới rút lớp nguồn */
function openTransfer(
  source: Enrollment,
  ctx: ReturnType<typeof useRuleContext>,
  modal: ReturnType<typeof App.useApp>['modal'],
  message: ReturnType<typeof App.useApp>['message'],
) {
  let picked: ID | undefined
  const candidates = ctx.data.classGroups.filter(
    (c) => c.status === 'published' && c.id !== source.classGroupId,
  )
  modal.confirm({
    title: 'Chuyển lớp',
    width: 520,
    content: (
      <Space direction="vertical" style={{ width: '100%' }}>
        <span style={{ fontSize: 13 }}>
          Hệ thống kiểm tra lớp đích trước (E01, E04, E05). Chỉ khi lớp đích hợp lệ mới rút khỏi lớp
          hiện tại — làm ngược lại học viên sẽ mất chỗ cả hai bên.
        </span>
        <Select
          style={{ width: '100%' }}
          placeholder="Chọn lớp đích"
          onChange={(v) => (picked = v)}
          options={candidates.map((c) => ({
            value: c.id,
            label: `${c.name} · ${fmtDateVi(c.startDate)} → ${fmtDateVi(c.endDate)}`,
          }))}
        />
      </Space>
    ),
    okText: 'Chuyển',
    cancelText: 'Huỷ',
    onOk: () => {
      if (!picked) {
        message.error('Chưa chọn lớp đích')
        return Promise.reject()
      }
      const res = transferClass(source.id, picked)
      if (!res.ok) {
        const first = res.violations.find((v) => v.severity === 'error')
        Modal.error({ title: 'Không thể chuyển lớp', content: first?.message })
        return Promise.reject()
      }
      message.success('Đã chuyển lớp')
      return Promise.resolve()
    },
  })
}
