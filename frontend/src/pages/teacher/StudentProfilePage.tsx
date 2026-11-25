import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { teacherApi, type ProfileQuestion, type StudentProfile } from '../../api/teacher'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { LEVEL_POINTS, LEVELS, rankOf } from '../../scoring/points'

/**
 * Профиль ученика для учителя (ТЗ, T4): все вопросы с оценками ИИ. Учитель может поставить уровень сам —
 * его оценка важнее оценки ИИ, очки ученика пересчитываются.
 */
export function StudentProfilePage() {
  const { id } = useParams()
  const { token } = useAuth()
  const [data, setData] = useState<StudentProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !id) return
    teacherApi
      .student(token, id)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить ученика'))
  }, [token, id])

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
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить оценку')
    }
  }

  const rank = data ? rankOf(data.points) : null

  return (
    <AppLayout
      back={data ? `/teacher/classes/${data.classId}?tab=skills` : '/'}
      title={data?.name ?? 'Ученик'}
      header={
        data &&
        rank && (
          <div className="rounded-3xl bg-pink-soft p-5 text-ink">
            <p className="text-sm text-muted">Класс {data.className}</p>
            <p className="mt-1 text-xl font-semibold">
              {rank.emoji} {rank.label} · {data.points} очк.
            </p>
            {data.streak > 0 && <p className="mt-1 text-sm text-muted">🔥 {data.streak} дн. подряд</p>}
          </div>
        )
      }
    >
      {error && <p className="mb-4 rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>}
      {!data && !error && <p className="text-muted">Загрузка…</p>}
      {data && data.sessions.length === 0 && <p className="text-muted">Ученик ещё не задавал вопросов.</p>}
      {data && data.sessions.length > 0 && (
        <p className="mb-5 text-sm text-muted">
          Не согласны с ИИ? Выберите уровень сами — очки ученика пересчитаются. «ИИ» — вернуть оценку ИИ.
        </p>
      )}

      <div className="space-y-5">
        {data?.sessions.map((s) => (
          <article key={s.id} className="rounded-3xl border-2 border-line p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="min-w-0 truncate font-semibold">{s.textTitle}</h3>
              <span className={`shrink-0 text-sm font-medium ${s.pending ? 'text-muted' : 'text-primary'}`}>
                {s.pending ? 'ждёт ИИ' : `+${s.points}`}
              </span>
            </div>
            {s.finishedAt && (
              <p className="text-sm text-muted">
                {new Date(s.finishedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}

            <ol className="mt-3 space-y-3">
              {s.questions.map((q) => (
                <QuestionRow key={q.id} q={q} onSet={(level) => setLevel(q, s.id, level)} />
              ))}
            </ol>

            {s.conclusion && (
              <div className="mt-3 rounded-2xl bg-primary-soft px-3 py-2 text-sm">
                <p className="text-muted">Вывод · {s.conclusionScore ?? '—'} из 20</p>
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
  const final = q.levelTeacher ?? q.levelAi
  return (
    <li className="text-sm">
      <p>
        <span className="text-muted">{q.position}.</span> {q.body}
      </p>
      {q.aiComment && <p className="mt-1 text-muted">ИИ: {q.aiComment}</p>}
      <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Уровень вопроса">
        {LEVELS.map((l, level) => {
          const active = final === level
          const byTeacher = active && q.levelTeacher !== null
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={active}
              title={`${l.label}: ${LEVEL_POINTS[level]} очков`}
              onClick={() => onSet(level)}
              className={`rounded-xl px-2.5 py-1 text-xs font-medium transition ${
                active ? (byTeacher ? 'bg-pink text-white' : 'bg-primary text-white') : 'bg-primary-soft text-muted hover:text-primary'
              }`}
            >
              {l.short}
            </button>
          )
        })}
        {q.levelTeacher !== null && (
          <button
            type="button"
            onClick={() => onSet(null)}
            className="rounded-xl px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary-soft"
            title={q.levelAi !== null ? `Вернуть оценку ИИ: ${LEVELS[q.levelAi].label}` : 'Вернуть оценку ИИ'}
          >
            ИИ
          </button>
        )}
      </div>
    </li>
  )
}
