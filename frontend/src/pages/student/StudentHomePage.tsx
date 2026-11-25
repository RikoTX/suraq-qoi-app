import { useEffect, useState, type FormEvent } from 'react'
import { LANG_LABEL, studentApi, type StudentClass, type StudentMe } from '../../api/classes'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { clearTexts, getMeta, setMeta } from '../../offline/db'
import { TextList } from './TextList'

const ME_KEY = 'studentMe'

/** Главная ученика. Без класса — ввод кода; с классом — карточка класса и тексты. */
export function StudentHomePage() {
  const { user, token } = useAuth()
  const [me, setMe] = useState<StudentMe | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    studentApi
      .me(token)
      .then((m) => {
        setMe(m)
        void setMeta(ME_KEY, JSON.stringify(m))
        // Учитель убрал из класса — тексты прежнего класса с телефона стираем.
        if (!m.class) void clearTexts()
      })
      .catch(async (e) => {
        // Нет связи — берём профиль с прошлого входа, чтобы тексты открывались офлайн.
        const cached = await getMeta(ME_KEY)
        if (cached && e instanceof ApiError && e.offline) setMe(JSON.parse(cached) as StudentMe)
        else setError(e instanceof ApiError ? e.message : 'Не удалось загрузить профиль')
      })
  }, [token])

  return (
    <AppLayout
      eyebrow="Сәлем!"
      title={user?.name ?? ''}
      header={
        me?.class && (
          <div className="flex items-center gap-4 rounded-3xl bg-pink-soft p-5 text-ink">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-lg font-semibold text-primary">
              {me.class.name.slice(0, 3)}
            </span>
            <div>
              <p className="text-sm text-muted">Мой класс</p>
              <p className="font-semibold">
                {me.class.name} · {LANG_LABEL[me.class.lang]}
              </p>
              <p className="text-sm text-muted">Учитель: {me.class.teacherName}</p>
            </div>
          </div>
        )
      }
    >
      {error && <p className="rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>}
      {!me && !error && <p className="text-muted">Загрузка…</p>}
      {me && !me.class && (
        <JoinClassForm
          onJoined={(c) => {
            const next = { ...me, class: c }
            setMe(next)
            void setMeta(ME_KEY, JSON.stringify(next))
          }}
        />
      )}
      {me?.class && <TextList lang={me.class.lang} />}
    </AppLayout>
  )
}

function JoinClassForm({ onJoined }: { onJoined: (c: StudentClass) => void }) {
  const { token } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    setError(null)
    setLoading(true)
    try {
      onJoined(await studentApi.joinClass(token, code))
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.joinCode ?? err.message) : 'Что-то пошло не так')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <h2 className="text-xl font-semibold">Вступите в класс</h2>
        <p className="mt-1 text-muted">Код класса даст учитель, например <span className="whitespace-nowrap">8A-4821</span>.</p>
      </div>
      <TextField
        label="Код класса"
        placeholder="8A-4821"
        autoCapitalize="characters"
        autoComplete="off"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        error={error ?? undefined}
      />
      <Button type="submit" loading={loading}>
        Вступить
      </Button>
    </form>
  )
}
