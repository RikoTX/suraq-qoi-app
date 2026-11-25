import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { KIND_LABEL, teacherTextsApi, TOPIC_EMOJI, TOPIC_LABEL, type GenerateRequest, type ReadingText } from '../../api/texts'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { Button } from '../../components/Button'
import { ListCard } from '../../components/ListCard'
import { Select } from '../../components/Select'
import { DIFFICULTY_OPTIONS, KIND_OPTIONS, TOPIC_OPTIONS } from './textOptions'

/** Раздел «Тексты» в классе: учитель пишет, генерирует через ИИ или берёт из библиотеки — и публикует. */
export function ClassTexts({ classId }: { classId: string }) {
  const { token } = useAuth()
  const [texts, setTexts] = useState<ReadingText[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!token) return
    teacherTextsApi
      .classTexts(token, classId)
      .then(setTexts)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить тексты'))
  }, [token, classId])

  const drafts = texts?.filter((t) => !t.reviewed) ?? []
  const published = texts?.filter((t) => t.reviewed) ?? []

  return (
    <section>
      <div className="grid grid-cols-3 gap-2">
        <ActionTile to={`/teacher/classes/${classId}/texts/new`} emoji="✍️" label="Написать" />
        <ActionTile onClick={() => setGenerating((g) => !g)} emoji="✨" label="ИИ" active={generating} />
        <ActionTile to={`/teacher/classes/${classId}/library`} emoji="📚" label="Библиотека" />
      </div>

      {generating && (
        <GenerateForm
          classId={classId}
          onDone={(created) => {
            setTexts((prev) => [...created, ...(prev ?? [])])
            setGenerating(false)
          }}
        />
      )}

      {error && <p className="mt-6 rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>}
      {!texts && !error && <p className="mt-6 text-muted">Загрузка…</p>}

      {texts?.length === 0 && (
        <p className="mt-6 rounded-3xl bg-primary-soft p-5 text-muted">
          У класса пока нет текстов. Напишите свой, попросите ИИ или возьмите готовые из библиотеки. Ученики увидят текст,
          когда вы его опубликуете.
        </p>
      )}

      {drafts.length > 0 && (
        <TextGroup title={`Черновики · ${drafts.length}`} note="Ученики их не видят. Прочитайте и опубликуйте." texts={drafts} />
      )}
      {published.length > 0 && <TextGroup title={`Опубликованы · ${published.length}`} texts={published} />}
    </section>
  )
}

function TextGroup({ title, note, texts }: { title: string; note?: string; texts: ReadingText[] }) {
  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold">{title}</h3>
      {note && <p className="text-sm text-muted">{note}</p>}
      <div className="mt-3 space-y-3">
        {texts.map((t) => (
          <ListCard
            key={t.id}
            to={`/teacher/texts/${t.id}`}
            icon={TOPIC_EMOJI[t.topic]}
            title={t.title}
            subtitle={`${TOPIC_LABEL[t.topic]} · ${KIND_LABEL[t.kind]} · ${'★'.repeat(t.difficulty)}`}
          />
        ))}
      </div>
    </div>
  )
}

function ActionTile({ to, onClick, emoji, label, active }: { to?: string; onClick?: () => void; emoji: string; label: string; active?: boolean }) {
  const cls = `flex flex-col items-center gap-1 rounded-3xl border-2 p-3 text-sm font-medium transition ${
    active ? 'border-primary bg-primary-soft text-primary' : 'border-line hover:border-primary/40'
  }`
  const body = (
    <>
      <span className="text-2xl" aria-hidden>
        {emoji}
      </span>
      {label}
    </>
  )
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls} aria-pressed={active}>
      {body}
    </button>
  )
}

function GenerateForm({ classId, onDone }: { classId: string; onDone: (texts: ReadingText[]) => void }) {
  const { token } = useAuth()
  const [form, setForm] = useState<GenerateRequest>({ topic: 'local', kind: 'notice', difficulty: 2, count: 1 })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    setError(null)
    setLoading(true)
    try {
      onDone(await teacherTextsApi.generate(token, classId, form))
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : 'Что-то пошло не так')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-3xl bg-primary-soft p-5" noValidate>
      <p className="text-muted">ИИ напишет черновик на языке класса. Вы прочитаете, поправите и опубликуете.</p>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Тема" value={form.topic} options={TOPIC_OPTIONS} onChange={(topic) => setForm({ ...form, topic })} />
        <Select label="Тип" value={form.kind} options={KIND_OPTIONS} onChange={(kind) => setForm({ ...form, kind })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Сложность" value={form.difficulty} options={DIFFICULTY_OPTIONS} onChange={(difficulty) => setForm({ ...form, difficulty })} />
        <Select
          label="Сколько"
          value={form.count}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
          onChange={(count) => setForm({ ...form, count })}
        />
      </div>
      {error && <p className="rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>}
      <Button type="submit" loading={loading}>
        {loading ? 'ИИ пишет…' : 'Сгенерировать'}
      </Button>
    </form>
  )
}
