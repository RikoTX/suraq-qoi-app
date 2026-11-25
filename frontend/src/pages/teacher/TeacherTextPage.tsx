import { useEffect, useId, useState, type TextareaHTMLAttributes } from 'react'
import { useNavigate, useParams } from 'react-router'
import { KIND_LABEL, teacherTextsApi, TOPIC_LABEL, type ReadingText, type TextUpdate } from '../../api/texts'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { Button } from '../../components/Button'
import { Markdown } from '../../components/Markdown'
import { Select } from '../../components/Select'
import { Tabs } from '../../components/Tabs'
import { TextField } from '../../components/TextField'
import { DIFFICULTY_OPTIONS, KIND_OPTIONS, LEVELS, TOPIC_OPTIONS } from './textOptions'

const EMPTY: TextUpdate = {
  title: '',
  body: '',
  topic: 'local',
  kind: 'article',
  difficulty: 2,
  exampleQuestions: {},
  hints: [],
  reviewed: false,
}

/**
 * Текст класса глазами учителя: чтение как у ученика, правка, публикация, удаление.
 * /teacher/texts/:id — существующий; /teacher/classes/:classId/texts/new — новый, написанный вручную.
 */
export function TeacherTextPage() {
  const { id, classId } = useParams()
  const isNew = !id
  const { token } = useAuth()
  const navigate = useNavigate()
  const [text, setText] = useState<(TextUpdate & Partial<ReadingText>) | null>(isNew ? EMPTY : null)
  const [mode, setMode] = useState<'view' | 'edit'>(isNew ? 'edit' : 'view')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!token || !id) return
    teacherTextsApi
      .get(token, id)
      .then(setText)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить текст'))
  }, [token, id])

  const backTo = text?.classId ? `/teacher/classes/${text.classId}?tab=texts` : classId ? `/teacher/classes/${classId}?tab=texts` : '/'

  async function save(next: TextUpdate) {
    if (!token) return
    setSaving(true)
    setErrors({})
    setError(null)
    try {
      if (isNew) {
        const created = await teacherTextsApi.create(token, classId!, next)
        navigate(`/teacher/texts/${created.id}`, { replace: true })
        return created
      }
      const saved = await teacherTextsApi.update(token, id, next)
      setText(saved)
      setMode('view')
      return saved
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        setErrors(err.fields)
        setMode('edit')
      } else setError(err instanceof ApiError ? err.message : 'Что-то пошло не так')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!token || !id || !text) return
    if (!confirm(`Удалить текст «${text.title}»? Ученики перестанут его видеть. Это нельзя отменить.`)) return
    try {
      await teacherTextsApi.remove(token, id)
      navigate(backTo, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить')
    }
  }

  const set = <K extends keyof TextUpdate>(key: K, value: TextUpdate[K]) => text && setText({ ...text, [key]: value })

  return (
    <AppLayout
      back={backTo}
      title={isNew ? 'Новый текст' : (text?.title ?? 'Текст')}
      header={
        text &&
        !isNew && (
          <div className="flex flex-wrap gap-2 text-sm">
            <span className={`rounded-full px-3 py-1 ${text.reviewed ? 'bg-white text-primary' : 'bg-pink-soft text-ink'}`}>
              {text.reviewed ? 'Опубликован' : 'Черновик'}
            </span>
            {[TOPIC_LABEL[text.topic], KIND_LABEL[text.kind], '★'.repeat(text.difficulty)].map((x) => (
              <span key={x} className="rounded-full bg-white/15 px-3 py-1">
                {x}
              </span>
            ))}
          </div>
        )
      }
    >
      {error && <p className="mb-6 rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>}
      {!text && !error && <p className="text-muted">Загрузка…</p>}

      {text && (
        <>
          {!isNew && (
            <Tabs
              label="Режим"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'view', label: 'Как у ученика' },
                { value: 'edit', label: 'Править' },
              ]}
            />
          )}

          {mode === 'view' ? (
            <div className="mt-6">
              <Markdown source={text.body} />
              {Object.keys(text.exampleQuestions).length > 0 && (
                <>
                  <h2 className="mt-8 text-lg font-semibold">Примеры вопросов</h2>
                  <p className="mt-1 text-sm text-muted">Ученики их не видят — по ним ИИ сверяет уровень вопросов.</p>
                  <ul className="mt-3 space-y-2">
                    {LEVELS.map(([lvl, name]) => (
                      <li key={lvl} className="rounded-2xl bg-primary-soft px-4 py-3">
                        <span className="text-sm font-medium text-primary">
                          {lvl}. {name}
                        </span>
                        <p>{text.exampleQuestions[lvl] || <span className="text-muted">—</span>}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {text.hints.length > 0 && (
                <>
                  <h2 className="mt-8 text-lg font-semibold">Подсказки ученику</h2>
                  <ul className="mt-3 list-disc space-y-1 pl-5">
                    {text.hints.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <div className={`space-y-5 ${isNew ? '' : 'mt-6'}`}>
              {isNew && (
                <p className="rounded-3xl bg-primary-soft p-5 text-muted">
                  Вставьте свой текст: объявление, расписание, заметку, задачу. 150–300 слов — оптимально. Язык — как у
                  класса.
                </p>
              )}
              <TextField label="Заголовок" value={text.title} onChange={(e) => set('title', e.target.value)} error={errors.title} />
              <TextArea
                label="Текст"
                hint="Можно markdown: **жирный**, списки через «- », таблицы через «|»."
                rows={14}
                value={text.body}
                onChange={(e) => set('body', e.target.value)}
                error={errors.body}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Тема" value={text.topic} options={TOPIC_OPTIONS} onChange={(v) => set('topic', v)} error={errors.topic} />
                <Select label="Тип" value={text.kind} options={KIND_OPTIONS} onChange={(v) => set('kind', v)} error={errors.kind} />
              </div>
              <Select
                label="Сложность"
                value={text.difficulty}
                options={DIFFICULTY_OPTIONS}
                onChange={(v) => set('difficulty', v)}
                error={errors.difficulty}
              />
              <details className="rounded-3xl bg-primary-soft p-5" open={!isNew && Object.keys(text.exampleQuestions).length > 0}>
                <summary className="cursor-pointer font-medium">Примеры вопросов и подсказки (необязательно)</summary>
                <div className="mt-4 space-y-4">
                  {LEVELS.map(([lvl, name]) => (
                    <TextField
                      key={lvl}
                      label={`Пример вопроса: ${lvl}. ${name}`}
                      value={text.exampleQuestions[lvl] ?? ''}
                      onChange={(e) => set('exampleQuestions', { ...text.exampleQuestions, [lvl]: e.target.value })}
                    />
                  ))}
                  <TextArea
                    label="Подсказки ученику (каждая с новой строки)"
                    rows={3}
                    value={text.hints.join('\n')}
                    onChange={(e) => set('hints', e.target.value.split('\n'))}
                  />
                </div>
              </details>
              <Button variant={isNew ? 'primary' : 'secondary'} loading={saving} onClick={() => save(text)}>
                {isNew ? 'Сохранить черновик' : 'Сохранить правки'}
              </Button>
            </div>
          )}

          {!isNew && (
            <div className="mt-8 space-y-3">
              {text.reviewed ? (
                <Button variant="secondary" loading={saving} onClick={() => save({ ...text, reviewed: false })}>
                  Скрыть от учеников
                </Button>
              ) : (
                <Button loading={saving} onClick={() => save({ ...text, reviewed: true }).then((t) => t && navigate(backTo))}>
                  Опубликовать для класса
                </Button>
              )}
              <button onClick={remove} className="w-full rounded-2xl px-6 py-3 text-sm font-medium text-danger hover:bg-pink-soft">
                Удалить текст
              </button>
            </div>
          )}
        </>
      )}
    </AppLayout>
  )
}

function TextArea({
  label,
  hint,
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        className={`w-full rounded-2xl border bg-white px-4 py-3.5 text-base outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15 ${
          error ? 'border-danger' : 'border-line'
        }`}
        {...props}
      />
      {hint && !error && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  )
}
