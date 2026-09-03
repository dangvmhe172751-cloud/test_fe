import { createBrowserRouter } from 'react-router'
import { ClassWizardPage } from '@/features/scheduling/ClassWizardPage'
import { ClassesPage } from '@/features/scheduling/ClassesPage'
import { CoursesPage } from '@/features/courses/CoursesPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { EnrollmentPage } from '@/features/enrollment/EnrollmentPage'
import { RoomsPage } from '@/features/rooms/RoomsPage'
import { StudentsPage } from '@/features/people/StudentsPage'
import { TeachersPage } from '@/features/people/TeachersPage'
import { TimetablePage } from '@/features/scheduling/TimetablePage'
import { AppLayout } from './AppLayout'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'timetable', element: <TimetablePage /> },
      { path: 'classes', element: <ClassesPage /> },
      { path: 'classes/new', element: <ClassWizardPage /> },
      { path: 'enrollment', element: <EnrollmentPage /> },
      { path: 'courses', element: <CoursesPage /> },
      { path: 'teachers', element: <TeachersPage /> },
      { path: 'students', element: <StudentsPage /> },
      { path: 'rooms', element: <RoomsPage /> },
    ],
  },
])
