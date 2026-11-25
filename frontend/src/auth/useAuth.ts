import { createContext, useContext } from 'react'
import type { AuthResponse, User } from './api'

export interface AuthState {
  user: User | null
  token: string | null
  /** true, пока проверяем сохранённый токен при запуске */
  loading: boolean
  /** pin — для ученика: запомнить его на устройстве, чтобы потом переключаться без сети */
  signIn: (auth: AuthResponse, pin?: string) => void
  signOut: () => void
}

export const AuthContext = createContext<AuthState | null>(null)

/** Текущий пользователь и вход/выход. Работает внутри <AuthProvider>. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
