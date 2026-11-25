import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { teacherApi, type ProfileQuestion, type StudentProfile } from '../../api/teacher'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { LEVEL_POINTS, rankOf } from '../../scoring/points'
import { useTeacherI18n } from './useTeacherI18n'

/**
 * Профиль ученика для учителя (ТЗ, T4): все вопросы с оценками ИИ. Учитель может поставить уровень сам —
 * его оценка важнее оценки ИИ, очки ученика пересчитываются.
 */
export function StudentProfilePage() {
  const { id } = useParams()
  const { token } = useAuth()
  const [data, setData] = useState<StudentProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { t, tt, err, date } = useTeacherI18n()

  useEffect(() => {
    if (!token || !id) return
    teacherApi
      .student(token, id)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? err(e.message) : tt('profile.loadError')))
  }, [token, id, err, tt])

  async function setLevel(q: ProfileQuestion, sessionId: string, level: number | null) {
    if (!token || !data) return
    setError(null)
    try {
      const res = await teacherApi.setLevel(token, q.id, level)
      setData({
        ...data,
        points: res.studentPoints,
        sessions: data.sessions.map((s) =>
          s.id !== sessionId
            ? s
            : { ...s, points: res.sessionPoints, questions: s.questions.map((x) => (x.id === q.id ? res.question : x)) },
        ),
      })
    } catch (e) {
      setError(e instanceof ApiError ? err(e.message) : tt('profile.saveError'))
    }
  }

  const rank = data ? rankOf(data.points) : null

  return (
    <AppLayout
      back={data ? `/teacher/classes/${data.classId}?tab=skills` : '/'}
      title={data?.name ?? tt('profile.student')}
      header={
        data &&
        rank && (
          <div className="rounded-3xl bg-pink-soft p-5 text-ink">
            <p className="text-sm text-muted">{tt('class.title', { name: data.className })}</p>
            <p className="mt-1 text-xl font-semibold">
              {rank.emoji} {t(`rank.${rank.code}`)} · {tt('common.points', { n: data.points })}
            </p>
            {data.streak > 0 && <p className="mt-1 text-sm text-muted">{tt('profile.streak', { n: data.streak })}</p>}
            <p className="mt-1 text-sm text-muted">
              {tt('profile.diag', { pre: data.diagnosticPre ?? '—', post: data.diagnosticPost ?? '—' })}
            </p>
          </div>
        )
      }
    >
      {error && <p className="mb-4 rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>}
      {!data && !error && <p className="text-muted">{t('common.loading')}</p>}
      {data && data.sessions.length === 0 && <p className="text-muted">{tt('profile.noSessions')}</p>}
      {data && data.sessions.length > 0 && (
        <p className="mb-5 text-sm text-muted">{tt('profile.overrideHint')}</p>
      )}

      <div className="space-y-5">
        {data?.sessions.map((s) => (
          <article key={s.id} className="rounded-3xl border-2 border-line p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="min-w-0 truncate font-semibold">{s.textTitle}</h3>
              <span className={`shrink-0 text-sm font-medium ${s.pending ? 'text-muted' : 'text-primary'}`}>
                {s.pending ? tt('profile.waitingAi') : `+${s.points}`}
              </span>
            </div>
            {s.finishedAt && (
              <p className="text-sm text-muted">
                {date(s.finishedAt, true)}
              </p>
            )}

            <ol className="mt-3 space-y-3">
              {s.questions.map((q) => (
                <QuestionRow key={q.id} q={q} onSet={(level) => setLevel(q, s.id, level)} />
              ))}
            </ol>

            {s.conclusion && (
              <div className="mt-3 rounded-2xl bg-primary-soft px-3 py-2 text-sm">
                <p className="text-muted">{tt('profile.conclusion', { score: s.conclusionScore ?? '—' })}</p>
                <p className="mt-1">{s.conclusion}</p>
              </div>
            )}
          </article>
        ))}
      </div>
    </AppLayout>
  )
}

function QuestionRow({ q, onSet }: { q: ProfileQuestion; onSet: (level: number | null) => void }) {
  const { t, tt } = useTeacherI18n()
  const final = q.levelTeacher ?? q.levelAi
  const label = (level: number) => t(`level.${level}` as 'level.0')
  return (
    <li className="text-sm">
      <p>
        <span className="text-muted">{q.position}.</span> {q.body}
      </p>
      {q.aiComment && <p className="mt-1 text-muted">{tt('profile.ai', { comment: q.aiComment })}</p>}
      <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={tt('profile.levelGroup')}>
        {LEVEL_POINTS.map((points, level) => {
          const active = final === level
          const byTeacher = active && q.levelTeacher !== null
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={active}
              title={tt('profile.levelTitle', { label: label(level), points })}
              onClick={() => onSet(level)}
              className={`rounded-xl px-2.5 py-1 text-xs font-medium transition ${
                active ? (byTeacher ? 'bg-pink text-white' : 'bg-primary text-white') : 'bg-primary-soft text-muted hover:text-primary'
              }`}
            >
              {tt(`level.short.${level}` as 'level.short.0')}
            </button>
          )
        })}
        {q.levelTeacher !== null && (
          <button
            type="button"
            onClick={() => onSet(null)}
            className="rounded-xl px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary-soft"
            title={q.levelAi !== null ? tt('profile.restore', { label: label(q.levelAi) }) : tt('profile.restorePlain')}
          >
            {tt('profile.aiButton')}
          </button>
        )}
      </div>
    </li>
  )
}
