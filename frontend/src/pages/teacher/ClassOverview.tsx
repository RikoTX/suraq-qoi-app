import { useEffect, useState } from 'react'
import { SIGNAL_LABEL, teacherApi, type ClassOverview as Overview } from '../../api/teacher'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { ListCard } from '../../components/ListCard'
import { LEVELS, rankOf } from '../../scoring/points'

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)

/**
 * Карта навыков класса (ТЗ, T3 и 11): какие вопросы задаёт класс за неделю, растёт ли глубина,
 * кто застрял и кто пропал. Графики — обычными блоками, без библиотек: учительский ноутбук тоже бывает медленным.
 */
export function ClassOverview({ classId }: { classId: string }) {
  const { token } = useAuth()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    teacherApi
      .overview(token, classId)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить карту навыков'))
  }, [token, classId])

  if (error) return <p className="rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>
  if (!data) return <p className="text-muted">Загрузка…</p>

  const total = data.skillMap7.reduce((a, b) => a + b, 0)
  const max = Math.max(1, ...data.skillMap7)
  const signals = data.students.filter((s) => s.signal && s.signal !== 'rising')

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Глубина за неделю" value={pct(data.depth7)} sub={data.depthPrev7 !== null ? `было ${pct(data.depthPrev7)}` : undefined} />
        <Stat label="Средний уровень" value={data.avgLevel7?.toFixed(1) ?? '—'} sub="из 4" />
        <Stat label="Активны" value={pct(data.activeShare7)} sub="за 7 дней" />
      </section>

      <section>
        <h2 className="text-xl font-semibold">Какие вопросы задаёт класс</h2>
        <p className="mt-1 text-sm text-muted">
          {total > 0 ? `${total} оценённых вопросов за 7 дней.` : 'За неделю оценённых вопросов пока нет.'} Глубина — доля
          вопросов «вывести» и «оценить».
        </p>
        <div className="mt-4 space-y-2">
          {data.skillMap7.map((n, level) => (
            <div key={level} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 text-muted">
                {level}. {LEVELS[level].label}
              </span>
              <span className="h-6 flex-1 overflow-hidden rounded-xl bg-primary-soft">
                <span
                  className={`block h-full rounded-xl ${level >= 3 ? 'bg-primary' : level === 0 ? 'bg-pink' : 'bg-primary/40'}`}
                  style={{ width: `${(n / max) * 100}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right font-medium">{n}</span>
            </div>
          ))}
        </div>
      </section>

      {signals.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold">Обратите внимание</h2>
          <ul className="mt-3 space-y-2">
            {signals.map((s) => (
              <li key={s.id} className="rounded-2xl bg-pink-soft px-4 py-3 text-sm">
                {SIGNAL_LABEL[s.signal!].emoji} <b>{s.name}</b> — {SIGNAL_LABEL[s.signal!].label.toLowerCase()}:{' '}
                {SIGNAL_LABEL[s.signal!].hint.toLowerCase()}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold">Ученики</h2>
        <div className="mt-4 space-y-3">
          {data.students.map((s) => (
            <ListCard
              key={s.id}
              to={`/teacher/students/${s.id}`}
              icon={rankOf(s.points).emoji}
              title={s.name}
              subtitle={`${s.points} очк. · глубина ${pct(s.depth7)} · ${s.sessions7} сесс. за неделю`}
              trailing={
                s.signal ? (
                  <span className="shrink-0 text-sm" title={SIGNAL_LABEL[s.signal].hint}>
                    {SIGNAL_LABEL[s.signal].emoji} {SIGNAL_LABEL[s.signal].label}
                  </span>
                ) : undefined
              }
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-3xl bg-primary-soft px-2 py-4">
      <p className="text-2xl font-semibold text-primary">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  )
}
