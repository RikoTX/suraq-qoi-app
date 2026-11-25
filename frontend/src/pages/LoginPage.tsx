import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError, authApi, studentAuthApi, type ClassLookup, type Classmate } from '../auth/api'
import { useAuth } from '../auth/useAuth'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '../components/Button'
import { PinField } from '../components/PinField'
import { RoleSwitch } from '../components/RoleSwitch'
import { TextField } from '../components/TextField'
import { useI18n } from '../i18n/useI18n'
import { db, type Profile } from '../offline/db'
import { needsPin, pendingCount, removeProfile, unlockProfile } from '../offline/profiles'

/** Текст ошибки на языке интерфейса (сервер отвечает на русском). */
function useMessage() {
  const { t, err } = useI18n()
  return (e: unknown) => (e instanceof ApiError ? err(e.message) : t('common.error'))
}

/** Вход. Ученики, уже входившие на этом телефоне, — сверху: переключиться можно и без сети. */
export function LoginPage() {
  const profiles = useLiveQuery(async () => (await db.profiles.toArray()).sort((a, b) => a.name.localeCompare(b.name)), [])
  const [role, setRole] = useState<'student' | 'teacher'>('student')
  const [adding, setAdding] = useState(false)
  const { t } = useI18n()

  if (profiles === undefined) return null
  const showProfiles = profiles.length > 0 && !adding

  return (
    <AuthLayout
      title={showProfiles ? t('login.who') : t('app.hello')}
      subtitle={showProfiles ? t('login.whoSub') : t('login.sub')}
    >
      {showProfiles ? (
        <>
          <DeviceProfiles profiles={profiles} />
          <Button variant="secondary" className="mt-6" onClick={() => setAdding(true)}>
            {t('login.other')}
          </Button>
        </>
      ) : (
        <div className="space-y-6">
          <RoleSwitch value={role} onChange={setRole} />
          {role === 'student' ? <StudentLogin /> : <TeacherLogin />}
          {profiles.length > 0 && (
            <button type="button" onClick={() => setAdding(false)} className="w-full text-center font-medium text-primary">
              {t('login.backToProfiles')}
            </button>
          )}
        </div>
      )}
    </AuthLayout>
  )
}

/** «Кто занимается?» — профили учеников на этом устройстве (ТЗ, 7.0.2). */
function DeviceProfiles({ profiles }: { profiles: Profile[] }) {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [locked, setLocked] = useState<Profile | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { t, rich } = useI18n()

  function open(p: Profile) {
    signIn(p.auth)
    navigate('/', { replace: true })
  }

  async function choose(p: Profile) {
    setError(null)
    setPin('')
    if (needsPin(p)) setLocked(p)
    else open(p)
  }

  async function onUnlock(e: FormEvent) {
    e.preventDefault()
    if (!locked) return
    if (await unlockProfile(locked, pin)) open(locked)
    else setError(t('login.wrongPin'))
  }

  async function remove(p: Profile) {
    const pending = await pendingCount(p.userId)
    if (pending > 0) {
      alert(t('login.unsent', { name: p.name, n: pending }))
      return
    }
    if (confirm(t('login.removeConfirm', { name: p.name }))) {
      await removeProfile(p.userId)
    }
  }

  if (locked) {
    return (
      <form onSubmit={onUnlock} className="space-y-5" noValidate>
        <p className="text-lg">{rich('login.hello', { name: <b>{locked.name}</b> })}</p>
        <PinField value={pin} onChange={setPin} error={error ?? undefined} autoFocus />
        <Button type="submit" disabled={pin.length !== 4}>
          {t('login.continue')}
        </Button>
        <button type="button" onClick={() => setLocked(null)} className="w-full text-center font-medium text-primary">
          {t('login.notMe')}
        </button>
      </form>
    )
  }

  return (
    <ul className="space-y-3">
      {profiles.map((p) => (
        <li key={p.userId} className="flex items-center gap-3 rounded-3xl border-2 border-line p-3 pr-4">
          <button type="button" onClick={() => choose(p)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-pink-soft text-lg font-semibold">
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block truncate text-sm text-muted">{p.className ? t('common.class', { name: p.className }) : t('common.noClass')}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => remove(p)}
            className="shrink-0 rounded-xl px-2 py-1 text-xs font-medium text-muted hover:bg-pink-soft hover:text-danger"
            aria-label={t('login.removeAria', { name: p.name })}
          >
            {t('login.remove')}
          </button>
        </li>
      ))}
    </ul>
  )
}

type Step = { kind: 'code' } | { kind: 'pick'; cls: ClassLookup } | { kind: 'pin'; cls: ClassLookup; who: Classmate } | { kind: 'new'; cls: ClassLookup }

/** Ученик: код класса → своё имя (или «я новенький») → PIN. Без email (ТЗ, 7.0.1). */
function StudentLogin() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>({ kind: 'code' })
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { t, err, rich, setLang } = useI18n()
  const message = useMessage()

  async function run(action: () => Promise<void>) {
    setError(null)
    setFields({})
    setLoading(true)
    try {
      await action()
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length > 0)
        setFields(Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, err(v)])))
      else setError(message(e))
    } finally {
      setLoading(false)
    }
  }

  const done = (res: Parameters<typeof signIn>[0]) => {
    signIn(res, pin)
    navigate('/', { replace: true })
  }

  const back = (to: Step) => () => {
    setError(null)
    setFields({})
    setPin('')
    setStep(to)
  }

  if (step.kind === 'code') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            const cls = await studentAuthApi.lookupClass(code)
            // Язык интерфейса — как у класса, если ученик сам его не выбирал.
            setLang(cls.lang, false)
            setStep(cls.students.length ? { kind: 'pick', cls } : { kind: 'new', cls })
          })
        }}
        className="space-y-5"
        noValidate
      >
        <TextField
          label={t('login.classCode')}
          placeholder="8A-4821"
          autoCapitalize="characters"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={error ?? undefined}
        />
        <p className="text-sm text-muted">{t('login.codeHint')}</p>
        <Button type="submit" loading={loading} disabled={code.trim().length < 5}>
          {t('common.next')}
        </Button>
      </form>
    )
  }

  if (step.kind === 'pick') {
    return (
      <div className="space-y-4">
        <p className="text-lg">{rich('login.findYourself', { name: <b>{step.cls.className}</b> })}</p>
        <ul className="grid grid-cols-2 gap-2">
          {step.cls.students.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setStep({ kind: 'pin', cls: step.cls, who: s })}
                className="w-full truncate rounded-2xl border-2 border-line px-3 py-3 text-left font-medium hover:border-primary/40"
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
        <Button variant="secondary" onClick={() => setStep({ kind: 'new', cls: step.cls })}>
          {t('login.imNew')}
        </Button>
        <button type="button" onClick={back({ kind: 'code' })} className="w-full text-center font-medium text-primary">
          {t('login.otherCode')}
        </button>
      </div>
    )
  }

  if (step.kind === 'pin') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => done(await studentAuthApi.login(code, step.who.id, pin)))
        }}
        className="space-y-5"
        noValidate
      >
        <p className="text-lg">{rich('login.hello', { name: <b>{step.who.name}</b> })}</p>
        <PinField value={pin} onChange={setPin} error={error ?? undefined} autoFocus />
        <p className="text-sm text-muted">{t('login.forgotPin')}</p>
        <Button type="submit" loading={loading} disabled={pin.length !== 4}>
          {t('login.signIn')}
        </Button>
        <button type="button" onClick={back({ kind: 'pick', cls: step.cls })} className="w-full text-center font-medium text-primary">
          {t('login.notMeBack')}
        </button>
      </form>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void run(async () => done(await studentAuthApi.register(code, name, pin)))
      }}
      className="space-y-5"
      noValidate
    >
      <p className="text-lg">{rich('login.whatName', { name: <b>{step.cls.className}</b> })}</p>
      <TextField
        label={t('login.name')}
        placeholder={t('login.namePlaceholder')}
        autoComplete="off"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={fields.name}
      />
      <PinField label={t('login.newPin')} value={pin} onChange={setPin} error={fields.pin} />
      <p className="text-sm text-muted">{t('login.newPinHint')}</p>
      {error && (
        <p role="alert" className="rounded-2xl bg-pink-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" loading={loading} disabled={name.trim().length < 2 || pin.length !== 4}>
        {t('common.done')}
      </Button>
      <button
        type="button"
        onClick={back(step.cls.students.length ? { kind: 'pick', cls: step.cls } : { kind: 'code' })}
        className="w-full text-center font-medium text-primary"
      >
        {t('common.back')}
      </button>
    </form>
  )
}

function TeacherLogin() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { t } = useI18n()
  const message = useMessage()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      signIn(await authApi.login(email, password))
      navigate('/', { replace: true })
    } catch (e) {
      setError(message(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
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
          label={t('login.password')}
          type="password"
          autoComplete="current-password"
          placeholder={t('login.passwordPlaceholder')}
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
          {t('login.signIn')}
        </Button>
      </form>
      <p className="text-center text-muted">
        {t('login.noTeacherAccount')}{' '}
        <Link to="/register" className="font-medium text-primary">
          {t('login.register')}
        </Link>
      </p>
    </>
  )
}
