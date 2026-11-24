import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/useAuth'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'

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
          <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
