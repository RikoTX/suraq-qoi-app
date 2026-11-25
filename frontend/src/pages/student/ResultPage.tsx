import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AppLayout } from '../../components/AppLayout'
import { Button } from '../../components/Button'
import { db } from '../../offline/db'
import { flushOutbox } from '../../offline/outbox'
import { finalLevel, isPending, LEVEL_POINTS, LEVELS, sessionPoints, shownLevel } from '../../scoring/points'

/**
 * Итог сессии. Читает из IndexedDB и обновляется сам, когда приходит оценка ИИ.
 * Пока её нет — предварительная оценка правилами, серым, с честной подписью (ТЗ, 9.3).
 */
export function ResultPage() {
  const { id } = useParams()
  const data = useLiveQuery(async () => {
    if (!id) return null
    const session = await db.sessions.get(id)
    if (!session) return null
    const questions = (await db.questions.where('sessionId').equals(id).toArray()).sort((a, b) => a.position - b.position)
    const queued = (await db.outbox.where('sessionId').equals(id).count()) > 0
    return { session, questions, queued }
  }, [id])
  const [sending, setSending] = useState(false)
  const navigate = useNavigate()

  if (data === undefined) return null
  if (data === null) {
    return (
      <AppLayout back="/" title="Сессия не найдена">
        <p className="text-muted">Её нет на этом устройстве.</p>
      </AppLayout>
    )
  }

  const { session, questions, queued } = data
  const pending = isPending(session, questions)
  const points = sessionPoints(session, questions)

  async function sendNow() {
    setSending(true)
    await flushOutbox(true).catch(() => {})
    setSending(false)
  }

  return (
    <AppLayout
      back="/"
      title="Итог"
      header={
        <div className="rounded-3xl bg-pink-soft p-5 text-ink">
          <p className="text-sm text-muted">{session.textTitle}</p>
          <p className={`mt-1 text-4xl font-semibold ${pending ? 'text-muted' : 'text-primary'}`}>+{points}</p>
          <p className="mt-1 text-sm text-muted">
            {pending ? 'Предварительно — ИИ проверит, когда появится интернет' : 'очков · проверено ИИ'}
          </p>
        </div>
      }
    >
      <div className="space-y-4">
        {questions.map((q) => {
          const level = shownLevel(q)
          const checked = finalLevel(q) !== null
          const deeper = checked && level > q.levelLocal
          return (
            <article key={q.id} className="rounded-3xl border-2 border-line p-4">
              <p className="font-medium">
                <span className="text-muted">{q.position}.</span> {q.body}
              </p>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className={`rounded-full px-3 py-1 font-medium ${checked ? 'bg-primary text-white' : 'bg-line text-muted'}`}>
                  {LEVELS[level].label}
                </span>
                <span className={checked ? 'font-medium text-primary' : 'text-muted'}>+{LEVEL_POINTS[level]}</span>
                {q.levelTeacher !== null && <span className="text-muted">· оценка учителя</span>}
                {!checked && <span className="text-muted">· предварительно</span>}
              </p>
              {deeper && (
                <p className="mt-2 text-sm font-medium text-primary">
                  Вопрос оказался глубже, +{LEVEL_POINTS[level] - LEVEL_POINTS[q.levelLocal]} очков
                </p>
              )}
              {q.comment && <p className="mt-2 text-sm">{q.comment}</p>}
              {q.hint && <p className="mt-2 rounded-2xl bg-primary-soft px-3 py-2 text-sm">💡 {q.hint}</p>}
            </article>
          )
        })}

        {session.conclusion && (
          <article className="rounded-3xl border-2 border-line p-4">
            <p className="text-sm text-muted">Твой вывод</p>
            <p className="mt-1">{session.conclusion}</p>
            <p className="mt-3 text-sm">
              <span className={session.conclusionScore !== null ? 'font-medium text-primary' : 'text-muted'}>
                +{session.conclusionScore ?? session.conclusionScoreLocal} из 20
              </span>
              {session.conclusionScore === null && <span className="text-muted"> · предварительно</span>}
            </p>
            {session.conclusionComment && <p className="mt-2 text-sm">{session.conclusionComment}</p>}
          </article>
        )}

        {queued && (
          <div className="rounded-3xl bg-primary-soft p-4 text-sm">
            <p>Ответы сохранены на телефоне и ждут отправки. Ничего не потеряется.</p>
            <Button variant="secondary" className="mt-3" loading={sending} onClick={sendNow}>
              Отправить сейчас
            </Button>
          </div>
        )}

        <Button onClick={() => navigate('/')}>К текстам</Button>
        <Link to={`/texts/${session.textId}/ask`} className="block text-center font-medium text-primary">
          Задать новые вопросы к этому тексту
        </Link>
      </div>
    </AppLayout>
  )
}
