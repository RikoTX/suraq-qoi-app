import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/useAuth'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { TextReadPage } from './pages/student/TextReadPage'
import { ResultPage } from './pages/student/ResultPage'
import { SessionPage } from './pages/student/SessionPage'
import { startOutboxSync } from './offline/outbox'

// Страницы учителя — отдельным чанком (ТЗ, 5.1): в первую загрузку ученика не входят.
const ClassPage = lazy(() => import('./pages/teacher/ClassPage').then((m) => ({ default: m.ClassPage })))
const LibraryPage = lazy(() => import('./pages/teacher/LibraryPage').then((m) => ({ default: m.LibraryPage })))
const TeacherTextPage = lazy(() => import('./pages/teacher/TeacherTextPage').then((m) => ({ default: m.TeacherTextPage })))

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
  // Очередь отправки работает для всех учеников на устройстве, на любом экране (ТЗ, 8).
  useEffect(() => startOutboxSync(), [])
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
            <Route path="/teacher/classes/:id" element={<RequireAuth><ClassPage /></RequireAuth>} />
            <Route path="/texts/:id" element={<RequireAuth><TextReadPage /></RequireAuth>} />
            <Route path="/texts/:id/ask" element={<RequireAuth><SessionPage /></RequireAuth>} />
            <Route path="/results/:id" element={<RequireAuth><ResultPage /></RequireAuth>} />
            <Route path="/teacher/texts/:id" element={<RequireAuth><TeacherTextPage /></RequireAuth>} />
            <Route path="/teacher/classes/:classId/texts/new" element={<RequireAuth><TeacherTextPage /></RequireAuth>} />
            <Route path="/teacher/classes/:classId/library" element={<RequireAuth><LibraryPage /></RequireAuth>} />
            <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
            <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
