import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError, authApi } from '../auth/api'
import { useAuth } from '../auth/useAuth'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      signIn(await authApi.login(email, password))
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Что-то пошло не так')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="С возвращением!" subtitle="Войдите, чтобы продолжить">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="Пароль"
          type="password"
          autoComplete="current-password"
          placeholder="Ваш пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && (
          <p role="alert" className="rounded-2xl bg-pink-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" loading={loading}>
          Войти
        </Button>
      </form>

      <p className="mt-8 text-center text-muted">
        Нет аккаунта?{' '}
        <Link to="/register" className="font-medium text-primary">
          Зарегистрироваться
        </Link>
      </p>
    </AuthLayout>
  )
}
