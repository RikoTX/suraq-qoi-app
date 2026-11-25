import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError, authApi } from '../auth/api'
import { useAuth } from '../auth/useAuth'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'
import { useI18n } from '../i18n/useI18n'

export function RegisterPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { t, err: tr } = useI18n()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setLoading(true)
    try {
      signIn(await authApi.register({ name, email, password }))
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0)
        setFieldErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, tr(v)])))
      else setError(err instanceof ApiError ? tr(err.message) : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title={t('register.title')} subtitle={t('register.sub')}>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <TextField
          label={t('register.name')}
          autoComplete="given-name"
          placeholder={t('register.namePlaceholder')}
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
          label={t('login.password')}
          type="password"
          autoComplete="new-password"
          placeholder={t('register.passwordPlaceholder')}
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
          {t('login.register')}
        </Button>
      </form>

      <p className="mt-8 text-center text-muted">
        {t('register.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-primary">
          {t('login.signIn')}
        </Link>
      </p>
    </AuthLayout>
  )
}
