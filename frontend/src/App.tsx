import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/useAuth'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { TextReadPage } from './pages/student/TextReadPage'
import { ClassPage } from './pages/teacher/ClassPage'
import { LibraryPage } from './pages/teacher/LibraryPage'
import { TeacherTextPage } from './pages/teacher/TeacherTextPage'

/** Только для вошедших. Остальных отправляем на вход. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? children : <Navigate to="/login" replace />
}

/** Только для гостей. Вошедших отправляем на главную. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <Navigate to="/" replace /> : children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/teacher/classes/:id" element={<RequireAuth><ClassPage /></RequireAuth>} />
          <Route path="/texts/:id" element={<RequireAuth><TextReadPage /></RequireAuth>} />
          <Route path="/teacher/texts/:id" element={<RequireAuth><TeacherTextPage /></RequireAuth>} />
          <Route path="/teacher/classes/:classId/texts/new" element={<RequireAuth><TeacherTextPage /></RequireAuth>} />
          <Route path="/teacher/classes/:classId/library" element={<RequireAuth><LibraryPage /></RequireAuth>} />
          <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
