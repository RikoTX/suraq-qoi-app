import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import type { StudentProgress } from '../../api/sessions'
import { db, getMeta } from '../../offline/db'
import { isPending, nextRank, rankOf, sessionPoints } from '../../scoring/points'

type Props = {
  userId: string
  /** Очки с сервера при входе — пока не было ни одной синхронизации сессий */
  fallback: StudentProgress | null
}

/**
 * Очки, ранг и стрик ученика (ТЗ, S6). Источник истины — сервер (последний ответ на отправку сессий);
 * сессии, которые ещё не проверил ИИ, показываются отдельно и в ранг не входят (ТЗ, 10).
 */
export function ProgressCard({ userId, fallback }: Props) {
  const data = useLiveQuery(async () => {
    const raw = await getMeta(`progress:${userId}`)
    const sessions = (await db.sessions.where('userId').equals(userId).toArray()).sort((a, b) =>
      b.finishedAt.localeCompare(a.finishedAt),
    )
    const questions = await db.questions.where('sessionId').anyOf(sessions.map((s) => s.id)).toArray()
    const withPoints = sessions.map((s) => {
      const qs = questions.filter((q) => q.sessionId === s.id)
      return { session: s, points: sessionPoints(s, qs), pending: isPending(s, qs) }
    })
    return { synced: raw ? (JSON.parse(raw) as StudentProgress) : null, sessions: withPoints }
  }, [userId])

  if (!data) return null
  const progress = data.synced ?? fallback
  const points = progress?.points ?? 0
  const pendingPoints = data.sessions.filter((s) => s.pending).reduce((sum, s) => sum + s.points, 0)
  const rank = rankOf(points)
  const next = nextRank(points)
  const share = next ? Math.round(((points - rank.from) / (next.from - rank.from)) * 100) : 100
  const recent = data.sessions.slice(0, 3)

  return (
    <section className="space-y-4">
      <div className="rounded-3xl bg-primary-soft p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Мой ранг</p>
            <p className="mt-1 text-xl font-semibold text-primary">
              {rank.emoji} {rank.label}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold">{points}</p>
            <p className="text-sm text-muted">очков</p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted">
          {next ? `Ещё ${next.from - points} до ранга «${next.label}»` : 'Высший ранг — ты мастер вопросов!'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {(progress?.streak ?? 0) > 0 && (
            <span className="rounded-full bg-white px-3 py-1">🔥 {progress?.streak} дн. подряд</span>
          )}
          {pendingPoints > 0 && (
            <span className="rounded-full bg-white px-3 py-1 text-muted">+{pendingPoints} ждут проверки ИИ</span>
          )}
        </div>
      </div>

      {recent.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold">Мои вопросы</h2>
          <ul className="mt-3 space-y-2">
            {recent.map(({ session, points: p, pending }) => (
              <li key={session.id}>
                <Link
                  to={`/results/${session.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border-2 border-line px-4 py-3 hover:border-primary/40"
                >
                  <span className="min-w-0 truncate">{session.textTitle}</span>
                  <span className={`shrink-0 text-sm font-medium ${pending ? 'text-muted' : 'text-primary'}`}>
                    +{p}
                    {pending && ' · ждёт'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
