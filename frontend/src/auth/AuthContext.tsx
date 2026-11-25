import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, authApi, type AuthResponse } from './api'
import { saveProfile } from '../offline/profiles'
import { AuthContext, type AuthState } from './useAuth'

const STORAGE_KEY = 'suraq-qoi.auth'

function readStored(): AuthResponse | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AuthResponse) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthResponse | null>(readStored)
  const [loading, setLoading] = useState(auth !== null)

  const signIn = useCallback((next: AuthResponse, pin?: string) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setAuth(next)
    // Ученика запоминаем на устройстве: телефон может быть общим на нескольких детей (ТЗ, 7.0.2).
    if (next.user.role === 'student' && pin !== undefined) void saveProfile(next, pin)
  }, [])

  /**
   * Выход. Ученик при этом остаётся в списке «Кто занимается?» на устройстве вместе с его сессиями
   * и очередью отправки — убрать его можно там же. Учитель и админ выходят полностью.
   */
  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setAuth(null)
  }, [])

  // При запуске проверяем, что сохранённый токен ещё действителен.
  // Нет сети — оставляем пользователя вошедшим (работа при слабом интернете).
  useEffect(() => {
    const stored = readStored()
    if (!stored) return
    authApi
      .me(stored.token)
      .then((user) => signIn({ token: stored.token, user }))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) signOut()
      })
      .finally(() => setLoading(false))
  }, [signIn, signOut])

  const value = useMemo<AuthState>(
    () => ({ user: auth?.user ?? null, token: auth?.token ?? null, loading, signIn, signOut }),
    [auth, loading, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
