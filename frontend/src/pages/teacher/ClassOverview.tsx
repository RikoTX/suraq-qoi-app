import { useEffect, useState } from 'react'
import { SKILL_LABEL, SKILLS } from '../../api/diagnostics'
import { SIGNAL_LABEL, teacherApi, type ClassOverview as Overview, type DiagnosticSummary } from '../../api/teacher'
import { Button } from '../../components/Button'
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

      <DiagnosticSection
        classId={classId}
        summary={data.diagnostic}
        onChange={(diagnostic) => setData({ ...data, diagnostic })}
      />

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
              subtitle={`${s.points} очк. · глубина ${pct(s.depth7)} · ${s.sessions7} сесс. за неделю${
                s.diagnosticPre !== null ? ` · проверка ${s.diagnosticPre}${s.diagnosticPost !== null ? `→${s.diagnosticPost}` : ''} из 6` : ''
              }`}
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

const num = (x: number) => x.toFixed(1).replace('.', ',')

/** Мини-диагностика (ТЗ, 11.1): «было/стало» по классу и по навыкам; учитель может открыть итоговую раньше. */
function DiagnosticSection({ classId, summary, onChange }: { classId: string; summary: DiagnosticSummary; onChange: (s: DiagnosticSummary) => void }) {
  const { token } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { pre, post, paired } = summary

  async function toggle() {
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const res = await teacherApi.setPostOpen(token, classId, !summary.postOpen)
      onChange({ ...summary, postOpen: res.postOpen })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h2 className="text-xl font-semibold">Проверка чтения</h2>
      <p className="mt-1 text-sm text-muted">
        6 заданий формата PISA: входная — перед первым текстом, итоговая — после {summary.postAfterSessions} сессий
        {summary.postOpen ? ' или сейчас (вы открыли её классу)' : ' или когда вы её откроете'}.
      </p>

      {!pre ? (
        <p className="mt-4 rounded-2xl bg-primary-soft px-4 py-3 text-sm">Ученики ещё не проходили входную проверку.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 text-center">
            <Stat label="До" value={`${num(pre.avg)} из 6`} sub={`${pre.count} уч.`} />
            <Stat label="После" value={post ? `${num(post.avg)} из 6` : '—'} sub={post ? `${post.count} уч.` : 'ещё никто'} />
          </div>
          {paired && (
            <p className="mt-3 text-sm">
              У {paired.count} учеников, прошедших обе проверки: <b>{num(paired.preAvg)} → {num(paired.postAvg)}</b> из 6.
            </p>
          )}
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 font-normal">Навык</th>
                <th className="py-1 text-right font-normal">До</th>
                <th className="py-1 text-right font-normal">После</th>
              </tr>
            </thead>
            <tbody>
              {SKILLS.map((s, i) => (
                <tr key={s} className="border-t border-line">
                  <td className="py-2">{SKILL_LABEL[s]}</td>
                  <td className="py-2 text-right">{num(pre.skills[i])}</td>
                  <td className="py-2 text-right">{post ? num(post.skills[i]) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-muted">Средний балл по навыку, из 2.</p>
        </>
      )}

      <Button variant="secondary" className="mt-4" loading={saving} onClick={toggle}>
        {summary.postOpen ? 'Закрыть итоговую проверку' : 'Открыть итоговую проверку классу'}
      </Button>
      {error && <p className="mt-2 text-sm text-pink">{error}</p>}
    </section>
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
