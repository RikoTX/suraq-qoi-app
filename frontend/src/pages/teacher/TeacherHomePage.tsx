import { useEffect, useState, type FormEvent } from 'react'
import { classesApi, LANG_LABEL, type Lang, type SchoolClass } from '../../api/classes'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { Button } from '../../components/Button'
import { ListCard } from '../../components/ListCard'
import { Tabs } from '../../components/Tabs'
import { TextField } from '../../components/TextField'
import { useTeacherI18n } from './useTeacherI18n'

/** Главная учителя: список классов и создание нового. */
export function TeacherHomePage() {
  const { user, token } = useAuth()
  const [classes, setClasses] = useState<SchoolClass[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const { t, tt, err, students } = useTeacherI18n()

  useEffect(() => {
    if (!token) return
    classesApi
      .list(token)
      .then(setClasses)
      .catch((e) => setLoadError(e instanceof ApiError ? err(e.message) : tt('home.loadError')))
  }, [token, err, tt])

  const empty = classes?.length === 0

  return (
    <AppLayout eyebrow={t('app.hello')} title={user?.name ?? ''}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{tt('home.title')}</h2>
        {!creating && classes && !empty && (
          <button onClick={() => setCreating(true)} className="text-sm font-medium text-primary">
            {tt('home.create')}
          </button>
        )}
      </div>

      {loadError && <p className="mt-4 rounded-2xl bg-pink-soft px-4 py-3 text-sm">{loadError}</p>}
      {classes === null && !loadError && <p className="mt-6 text-muted">{t('common.loading')}</p>}

      {(creating || empty) && (
        <CreateClassForm
          onCancel={empty ? undefined : () => setCreating(false)}
          onCreated={(c) => {
            setClasses((prev) => [c, ...(prev ?? [])])
            setCreating(false)
          }}
        />
      )}

      <div className="mt-5 space-y-3">
        {classes?.map((c) => (
          <ListCard
            key={c.id}
            to={`/teacher/classes/${c.id}`}
            icon={c.name.slice(0, 3)}
            title={`${c.name} · ${LANG_LABEL[c.lang]}`}
            subtitle={tt('home.code', { code: c.joinCode, students: students(c.studentCount) })}
          />
        ))}
      </div>
    </AppLayout>
  )
}

function CreateClassForm({ onCreated, onCancel }: { onCreated: (c: SchoolClass) => void; onCancel?: () => void }) {
  const { token } = useAuth()
  const [name, setName] = useState('')
  const [lang, setLang] = useState<Lang>('kk')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { t, tt, err: tr } = useTeacherI18n()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    setErrors({})
    setError(null)
    setLoading(true)
    try {
      onCreated(await classesApi.create(token, { name, lang }))
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length)
        setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, tr(v)])))
      else setError(err instanceof ApiError ? tr(err.message) : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-5 rounded-3xl bg-primary-soft p-5" noValidate>
      <p className="text-muted">{tt('create.intro')}</p>
      <TextField
        label={tt('create.name')}
        placeholder="8А"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
      />
      <Tabs
        label={tt('create.lang')}
        value={lang}
        onChange={setLang}
        options={[
          { value: 'kk', label: LANG_LABEL.kk },
          { value: 'ru', label: LANG_LABEL.ru },
        ]}
      />
      {error && <p className="rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>}
      <Button type="submit" loading={loading}>
        {tt('create.submit')}
      </Button>
      {onCancel && (
        <Button type="button" variant="secondary" className="bg-white" onClick={onCancel}>
          {tt('common.cancel')}
        </Button>
      )}
    </form>
  )
}
