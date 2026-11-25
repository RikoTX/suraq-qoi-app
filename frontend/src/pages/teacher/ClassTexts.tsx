import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { teacherTextsApi, TOPIC_EMOJI, type GenerateRequest, type ReadingText } from '../../api/texts'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { Button } from '../../components/Button'
import { ListCard } from '../../components/ListCard'
import { Select } from '../../components/Select'
import { difficultyOptions, kindOptions, topicOptions } from './textOptions'
import { useTeacherI18n } from './useTeacherI18n'

/** Раздел «Тексты» в классе: учитель пишет, генерирует через ИИ или берёт из библиотеки — и публикует. */
export function ClassTexts({ classId }: { classId: string }) {
  const { token } = useAuth()
  const [texts, setTexts] = useState<ReadingText[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const { t, tt, err } = useTeacherI18n()

  useEffect(() => {
    if (!token) return
    teacherTextsApi
      .classTexts(token, classId)
      .then(setTexts)
      .catch((e) => setError(e instanceof ApiError ? err(e.message) : tt('texts.loadError')))
  }, [token, classId, err, tt])

  const drafts = texts?.filter((x) => !x.reviewed) ?? []
  const published = texts?.filter((x) => x.reviewed) ?? []

  return (
    <section>
      <div className="grid grid-cols-3 gap-2">
        <ActionTile to={`/teacher/classes/${classId}/texts/new`} emoji="✍️" label={tt('texts.write')} />
        <ActionTile onClick={() => setGenerating((g) => !g)} emoji="✨" label={tt('texts.ai')} active={generating} />
        <ActionTile to={`/teacher/classes/${classId}/library`} emoji="📚" label={tt('texts.library')} />
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
      {!texts && !error && <p className="mt-6 text-muted">{t('common.loading')}</p>}

      {texts?.length === 0 && (
        <p className="mt-6 rounded-3xl bg-primary-soft p-5 text-muted">
          {tt('texts.empty')}
        </p>
      )}

      {drafts.length > 0 && (
        <TextGroup title={tt('texts.drafts', { n: drafts.length })} note={tt('texts.draftsNote')} texts={drafts} />
      )}
      {published.length > 0 && <TextGroup title={tt('texts.published', { n: published.length })} texts={published} />}
    </section>
  )
}

function TextGroup({ title, note, texts }: { title: string; note?: string; texts: ReadingText[] }) {
  const { t } = useTeacherI18n()
  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold">{title}</h3>
      {note && <p className="text-sm text-muted">{note}</p>}
      <div className="mt-3 space-y-3">
        {texts.map((x) => (
          <ListCard
            key={x.id}
            to={`/teacher/texts/${x.id}`}
            icon={TOPIC_EMOJI[x.topic]}
            title={x.title}
            subtitle={`${t(`topic.${x.topic}`)} · ${t(`kind.${x.kind}`)} · ${'★'.repeat(x.difficulty)}`}
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
  const { t, tt, err: tr } = useTeacherI18n()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    setError(null)
    setLoading(true)
    try {
      onDone(await teacherTextsApi.generate(token, classId, form))
    } catch (err) {
      setError(err instanceof ApiError ? tr(Object.values(err.fields)[0] ?? err.message) : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-3xl bg-primary-soft p-5" noValidate>
      <p className="text-muted">{tt('gen.intro')}</p>
      <div className="grid grid-cols-2 gap-3">
        <Select label={tt('gen.topic')} value={form.topic} options={topicOptions(t)} onChange={(topic) => setForm({ ...form, topic })} />
        <Select label={tt('gen.kind')} value={form.kind} options={kindOptions(t)} onChange={(kind) => setForm({ ...form, kind })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label={tt('gen.difficulty')}
          value={form.difficulty}
          options={difficultyOptions(tt)}
          onChange={(difficulty) => setForm({ ...form, difficulty })}
        />
        <Select
          label={tt('gen.count')}
          value={form.count}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
          onChange={(count) => setForm({ ...form, count })}
        />
      </div>
      {error && <p className="rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>}
      <Button type="submit" loading={loading}>
        {loading ? tt('gen.writing') : tt('gen.submit')}
      </Button>
    </form>
  )
}
