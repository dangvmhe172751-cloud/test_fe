// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { App as AntApp, ConfigProvider } from 'antd'
import viVN from 'antd/locale/vi_VN'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { CoursesPage } from '@/features/courses/CoursesPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { EnrollmentPage } from '@/features/enrollment/EnrollmentPage'
import { RoomsPage } from '@/features/rooms/RoomsPage'
import { StudentsPage } from '@/features/people/StudentsPage'
import { TeachersPage } from '@/features/people/TeachersPage'
import { ClassesPage } from '@/features/scheduling/ClassesPage'
import { ClassWizardPage } from '@/features/scheduling/ClassWizardPage'
import { TimetablePage } from '@/features/scheduling/TimetablePage'
import { useDb } from '@/mocks/store'

function renderPage(ui: ReactElement) {
  return render(
    <ConfigProvider locale={viVN}>
      <AntApp>
        <MemoryRouter>
          <Routes>
            <Route path="*" element={ui} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </ConfigProvider>,
  )
}

beforeEach(() => {
  useDb.getState().reset()
  useDb.getState().setActor({ role: 'admin', id: 'U01' })
})

describe('các trang render được với dữ liệu mock', () => {
  it('Tổng quan', () => {
    renderPage(<DashboardPage />)
    expect(screen.getByText('Tổng quan')).toBeTruthy()
    expect(screen.getByText('Học viên đang học')).toBeTruthy()
    expect(screen.getByText('Tỉ lệ lấp đầy lớp')).toBeTruthy()
  })

  it('Thời khóa biểu — có vẽ buổi học của tuần hiện tại', () => {
    const { container } = renderPage(<TimetablePage />)
    expect(screen.getByText('Thời khóa biểu')).toBeTruthy()
    const draggable = container.querySelectorAll('[draggable="true"]')
    expect(draggable.length).toBeGreaterThan(0)
  })

  it('Thời khóa biểu — panel xung đột phát hiện được xung đột cài sẵn trong seed', () => {
    renderPage(<TimetablePage />)
    // seed cố ý dời 1 buổi của L06 vào phòng P201 trùng giờ lớp L05
    expect(screen.getAllByText(/Phòng P201 đã có lớp/).length).toBeGreaterThan(0)
  })

  it('Lớp học', () => {
    renderPage(<ClassesPage />)
    expect(screen.getByText('Mở lớp mới')).toBeTruthy()
    expect(screen.getAllByText('ENG-A1.01').length).toBeGreaterThan(0)
  })

  it('Mở lớp mới — wizard bước 1', () => {
    renderPage(<ClassWizardPage />)
    expect(screen.getAllByText('Chọn khóa học').length).toBeGreaterThan(0)
  })

  it('Đăng ký học', () => {
    renderPage(<EnrollmentPage />)
    expect(screen.getByText('Ghi danh học viên vào lớp')).toBeTruthy()
  })

  it('Khóa học', () => {
    renderPage(<CoursesPage />)
    expect(screen.getAllByText('Tiếng Anh giao tiếp A1').length).toBeGreaterThan(0)
  })

  it('Giáo viên', () => {
    renderPage(<TeachersPage />)
    expect(screen.getAllByText('Nguyễn Thu Hà').length).toBeGreaterThan(0)
  })

  it('Phòng học', () => {
    renderPage(<RoomsPage />)
    expect(screen.getAllByText('LAB1 (Máy tính)').length).toBeGreaterThan(0)
  })

  it('Học viên — vai trò admin thấy đầy đủ SĐT', () => {
    const { container } = renderPage(<StudentsPage />)
    const table = container.querySelector('.ant-table-tbody')!
    expect(within(table as HTMLElement).queryAllByText('098****321')).toHaveLength(0)
  })

  it('Học viên — vai trò giáo viên bị che SĐT phụ huynh (X01)', () => {
    useDb.getState().setActor({ role: 'teacher', id: 'U03' })
    const { container } = renderPage(<StudentsPage />)
    const table = container.querySelector('.ant-table-tbody')!
    expect(within(table as HTMLElement).getAllByText('098****321').length).toBeGreaterThan(0)
  })
})
