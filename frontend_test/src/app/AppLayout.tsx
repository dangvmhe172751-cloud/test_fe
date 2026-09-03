import {
  AppstoreOutlined,
  BankOutlined,
  BookOutlined,
  CalendarOutlined,
  DashboardOutlined,
  SolutionOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Layout, Menu, Select, Space, Tag, Typography } from 'antd'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useDb } from '@/mocks/store'
import type { Role } from '@/shared/domain/types'

const { Sider, Header, Content } = Layout

const ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: 'Tổng quan' },
  { key: '/timetable', icon: <CalendarOutlined />, label: 'Thời khóa biểu' },
  { key: '/classes', icon: <AppstoreOutlined />, label: 'Lớp học' },
  { key: '/enrollment', icon: <SolutionOutlined />, label: 'Đăng ký học' },
  { key: '/courses', icon: <BookOutlined />, label: 'Khóa học' },
  { key: '/teachers', icon: <UserOutlined />, label: 'Giáo viên' },
  { key: '/students', icon: <TeamOutlined />, label: 'Học viên' },
  { key: '/rooms', icon: <BankOutlined />, label: 'Phòng học' },
]

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Quản trị',
  academic: 'Học vụ',
  teacher: 'Giáo viên',
  student: 'Học viên',
}

export function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const users = useDb((s) => s.data.users)
  const actor = useDb((s) => s.actor)
  const setActor = useDb((s) => s.setActor)
  const centerName = useDb((s) => s.data.settings.name)

  const selected =
    ITEMS.map((i) => i.key)
      .filter((k) => k !== '/' && pathname.startsWith(k))
      .sort((a, b) => b.length - a.length)[0] ?? '/'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={210} theme="light" style={{ borderRight: '1px solid #eee' }}>
        <div style={{ padding: '16px 16px 8px' }}>
          <Typography.Text strong style={{ fontSize: 15, lineHeight: 1.3, display: 'block' }}>
            {centerName}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Hệ thống quản lý đào tạo
          </Typography.Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selected]}
          items={ITEMS.map((i) => ({
            ...i,
            label: <NavLink to={i.key}>{i.label}</NavLink>,
          }))}
          style={{ borderInlineEnd: 0 }}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            borderBottom: '1px solid #eee',
            paddingInline: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
          }}
        >
          <Space>
            <Tag color="blue">Dữ liệu mô phỏng</Tag>
            <Typography.Text type="secondary">Đang xem với vai trò</Typography.Text>
            <Select
              size="small"
              style={{ width: 220 }}
              value={actor.id}
              onChange={(id) => {
                const u = users.find((x) => x.id === id)!
                setActor({ role: u.role, id: u.id })
              }}
              options={users.map((u) => ({
                value: u.id,
                label: `${u.fullName} — ${ROLE_LABEL[u.role]}`,
              }))}
            />
          </Space>
        </Header>
        <Content style={{ padding: 20, background: '#f6f7f9' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
