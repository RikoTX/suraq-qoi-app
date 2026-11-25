import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { SKILLS, type DiagnosticForm } from '../../api/diagnostics'
import { useAuth } from '../../auth/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { Button } from '../../components/Button'
import { Markdown } from '../../components/Markdown'
import { useI18n } from '../../i18n/useI18n'
import { db } from '../../offline/db'
import { cachedStatus, score } from '../../offline/diagnostics'
import { flushOutbox } from '../../offline/outbox'

/**
 * Мини-диагностика (ТЗ, 11.1): 2 текста по 3 задания с выбором ответа. Работает без сети —
 * задания уже на устройстве, проверка здесь же, результат уходит через очередь отправки.
 */
export function DiagnosticPage() {
  const { kind } = useParams<{ kind: 'pre' | 'post' }>()
  const { user } = useAuth()
  const data = useLiveQuery(async () => {
    if (!user || (kind !== 'pre' && kind !== 'post')) return null
    const done = (await db.diagnostics.where('userId').equals(user.id).toArray()).find((d) => d.kind === kind) ?? null
    const form = (await cachedStatus(user.id))?.forms.find((f) => f.kind === kind) ?? null
    return { done, form }
  }, [user, kind])
  const { t } = useI18n()

  if (data === undefined || !user) return null
  const title = kind === 'post' ? t('diag.post') : t('diag.pre')

  if (data?.done) {
    return (
      <AppLayout back="/" title={title}>
        <Result score={data.done.score} skills={data.done.skills} kind={data.done.kind} synced={data.done.synced} />
      </AppLayout>
    )
  }
  if (!data?.form) {
    return (
      <AppLayout back="/" title={title}>
        <p className="text-muted">{t('diag.unavailable')}</p>
      </AppLayout>
    )
  }
  return <Quiz form={data.form} userId={user.id} title={title} />
}

function Quiz({ form, userId, title }: { form: DiagnosticForm; userId: string; title: string }) {
  const [startedAt] = useState(() => new Date().toISOString())
  const [page, setPage] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>(() => form.texts.flatMap((t) => t.tasks.map(() => null)))
  const [saving, setSaving] = useState(false)
  const { t } = useI18n()

  const text = form.texts[page]
  const offset = form.texts.slice(0, page).reduce((n, t) => n + t.tasks.length, 0)
  const pageDone = text.tasks.every((_, i) => answers[offset + i] !== null)
  const last = page === form.texts.length - 1

  async function finish() {
    setSaving(true)
    const picked = answers.map((a) => a ?? -1)
    const local = score(form, picked)
    await db.diagnostics.put({
      id: crypto.randomUUID(),
      userId,
      kind: form.kind,
      form: form.form,
      lang: form.lang,
      answers: picked,
      ...local,
      startedAt,
      finishedAt: new Date().toISOString(),
      synced: false,
      attempts: 0,
      nextAt: 0,
    })
    void flushOutbox(true)
  }

  function next() {
    if (last) return void finish()
    setPage(page + 1)
    window.scrollTo({ top: 0 })
  }

  return (
    <AppLayout
      back="/"
      eyebrow={t('diag.textOf', { n: page + 1, m: form.texts.length })}
      title={title}
    >
      {page === 0 && (
        <p className="mb-5 rounded-2xl bg-primary-soft px-4 py-3 text-sm">
          {t('diag.intro')}
        </p>
      )}

      <article className="rounded-3xl border-2 border-line p-4">
        <h2 className="text-lg font-semibold">{text.title}</h2>
        <div className="mt-2">
          <Markdown source={text.body} />
        </div>
      </article>

      <ol className="mt-6 space-y-6">
        {text.tasks.map((task, i) => {
          const n = offset + i
          return (
            <li key={n}>
              <p className="font-medium">
                {n + 1}. {task.q}
              </p>
              <div className="mt-3 space-y-2" role="radiogroup" aria-label={t('session.question', { n: n + 1 })}>
                {task.options.map((o, j) => {
                  const active = answers[n] === j
                  return (
                    <button
                      key={j}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setAnswers((prev) => prev.map((a, k) => (k === n ? j : a)))}
                      className={`block w-full rounded-2xl border-2 px-4 py-3 text-left text-sm transition ${
                        active ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-line hover:border-primary/40'
                      }`}
                    >
                      {o}
                    </button>
                  )
                })}
              </div>
            </li>
          )
        })}
      </ol>

      <Button className="mt-8" disabled={!pageDone} loading={saving} onClick={next}>
        {last ? t('common.done') : t('common.next')}
      </Button>
      {!pageDone && <p className="mt-2 text-center text-sm text-muted">{t('diag.answerAll')}</p>}
    </AppLayout>
  )
}

function Result({ score, skills, kind, synced }: { score: number; skills: number[]; kind: 'pre' | 'post'; synced: boolean }) {
  const { t } = useI18n()
  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-primary-soft p-5 text-center">
        <p className="text-4xl font-semibold text-primary">{t('diag.score', { n: score })}</p>
        <p className="mt-1 text-muted">{t('diag.correct')}</p>
      </div>
      <ul className="space-y-2 text-sm">
        {SKILLS.map((s, i) => (
          <li key={s} className="flex items-center justify-between rounded-2xl border-2 border-line px-4 py-3">
            <span>{t(`skill.${s}`)}</span>
            <span className="font-medium">{t('diag.skillScore', { n: skills[i] })}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        {kind === 'pre' ? t('diag.thanksPre') : t('diag.thanksPost')}
        {!synced && t('diag.notSynced')}
      </p>
      <Link to="/" className="block w-full rounded-2xl bg-primary px-6 py-4 text-center font-medium text-white hover:bg-primary-dark">
        {t('result.toTexts')}
      </Link>
    </div>
  )
}
