import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError, authApi, type Role } from '../auth/api'
import { useAuth } from '../auth/useAuth'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '../components/Button'
import { RoleSwitch } from '../components/RoleSwitch'
import { TextField } from '../components/TextField'

export function RegisterPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState<Exclude<Role, 'admin'>>('student')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setLoading(true)
    try {
      signIn(await authApi.register({ name, email, password, role }))
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setFieldErrors(err.fields)
      else setError(err instanceof ApiError ? err.message : 'Что-то пошло не так')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Создать аккаунт" subtitle="Это займёт меньше минуты">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <RoleSwitch value={role} onChange={setRole} />

        <TextField
          label="Имя"
          autoComplete="given-name"
          placeholder={role === 'student' ? 'Например, Айгерим' : 'Например, Айгуль Сериковна'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          required
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          required
        />
        <TextField
          label="Пароль"
          type="password"
          autoComplete="new-password"
          placeholder="Минимум 8 символов"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          required
        />

        {error && (
          <p role="alert" className="rounded-2xl bg-pink-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" loading={loading}>
          Зарегистрироваться
        </Button>
      </form>

      <p className="mt-8 text-center text-muted">
        Уже есть аккаунт?{' '}
        <Link to="/login" className="font-medium text-primary">
          Войти
        </Link>
      </p>
    </AuthLayout>
  )
}
