import { useEffect, useState, type FormEvent } from 'react'
import { classesApi, LANG_LABEL, type Lang, type SchoolClass } from '../../api/classes'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { Button } from '../../components/Button'
import { ListCard } from '../../components/ListCard'
import { Tabs } from '../../components/Tabs'
import { TextField } from '../../components/TextField'
import { pluralStudents } from './plural'

/** Главная учителя: список классов и создание нового. */
export function TeacherHomePage() {
  const { user, token } = useAuth()
  const [classes, setClasses] = useState<SchoolClass[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!token) return
    classesApi
      .list(token)
      .then(setClasses)
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Не удалось загрузить классы'))
  }, [token])

  const empty = classes?.length === 0

  return (
    <AppLayout eyebrow="Сәлем!" title={user?.name ?? ''}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Мои классы</h2>
        {!creating && classes && !empty && (
          <button onClick={() => setCreating(true)} className="text-sm font-medium text-primary">
            + Создать
          </button>
        )}
      </div>

      {loadError && <p className="mt-4 rounded-2xl bg-pink-soft px-4 py-3 text-sm">{loadError}</p>}
      {classes === null && !loadError && <p className="mt-6 text-muted">Загрузка…</p>}

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
            subtitle={`Код ${c.joinCode} · ${c.studentCount} ${pluralStudents(c.studentCount)}`}
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    setErrors({})
    setError(null)
    setLoading(true)
    try {
      onCreated(await classesApi.create(token, { name, lang }))
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields)
      else setError(err instanceof ApiError ? err.message : 'Что-то пошло не так')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-5 rounded-3xl bg-primary-soft p-5" noValidate>
      <p className="text-muted">Создайте класс — ученики вступят в него по коду.</p>
      <TextField
        label="Название класса"
        placeholder="8А"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
      />
      <Tabs
        label="Язык текстов"
        value={lang}
        onChange={setLang}
        options={[
          { value: 'kk', label: LANG_LABEL.kk },
          { value: 'ru', label: LANG_LABEL.ru },
        ]}
      />
      {error && <p className="rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>}
      <Button type="submit" loading={loading}>
        Создать класс
      </Button>
      {onCancel && (
        <Button type="button" variant="secondary" className="bg-white" onClick={onCancel}>
          Отмена
        </Button>
      )}
    </form>
  )
}
