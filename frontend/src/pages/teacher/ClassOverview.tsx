import { useEffect, useState } from 'react'
import { SKILLS } from '../../api/diagnostics'
import { SIGNAL_EMOJI, teacherApi, type ClassOverview as Overview, type DiagnosticSummary } from '../../api/teacher'
import { Button } from '../../components/Button'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { ListCard } from '../../components/ListCard'
import { rankOf } from '../../scoring/points'
import { useTeacherI18n } from './useTeacherI18n'

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)

/**
 * Карта навыков класса (ТЗ, T3 и 11): какие вопросы задаёт класс за неделю, растёт ли глубина,
 * кто застрял и кто пропал. Графики — обычными блоками, без библиотек: учительский ноутбук тоже бывает медленным.
 */
export function ClassOverview({ classId }: { classId: string }) {
  const { token } = useAuth()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { t, tt, err } = useTeacherI18n()

  useEffect(() => {
    if (!token) return
    teacherApi
      .overview(token, classId)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? err(e.message) : tt('overview.loadError')))
  }, [token, classId, err, tt])

  if (error) return <p className="rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>
  if (!data) return <p className="text-muted">{t('common.loading')}</p>

  const total = data.skillMap7.reduce((a, b) => a + b, 0)
  const max = Math.max(1, ...data.skillMap7)
  const signals = data.students.filter((s) => s.signal && s.signal !== 'rising')

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-3 gap-3 text-center">
        <Stat
          label={tt('overview.depth')}
          value={pct(data.depth7)}
          sub={data.depthPrev7 !== null ? tt('overview.was', { v: pct(data.depthPrev7) }) : undefined}
        />
        <Stat label={tt('overview.avgLevel')} value={data.avgLevel7?.toFixed(1) ?? '—'} sub={tt('overview.of4')} />
        <Stat label={tt('overview.active')} value={pct(data.activeShare7)} sub={tt('overview.days7')} />
      </section>

      <section>
        <h2 className="text-xl font-semibold">{tt('overview.mapTitle')}</h2>
        <p className="mt-1 text-sm text-muted">
          {total > 0 ? tt('overview.mapCount', { n: total }) : tt('overview.mapNone')} {tt('overview.depthNote')}
        </p>
        <div className="mt-4 space-y-2">
          {data.skillMap7.map((n, level) => (
            <div key={level} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 text-muted">
                {level}. {t(`level.${level}` as 'level.0')}
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
          <h2 className="text-xl font-semibold">{tt('overview.attention')}</h2>
          <ul className="mt-3 space-y-2">
            {signals.map((s) => (
              <li key={s.id} className="rounded-2xl bg-pink-soft px-4 py-3 text-sm">
                {SIGNAL_EMOJI[s.signal!]} <b>{s.name}</b> — {tt(`signal.${s.signal!}`).toLowerCase()}:{' '}
                {tt(`signal.${s.signal!}.hint`).toLowerCase()}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold">{tt('overview.students')}</h2>
        <div className="mt-4 space-y-3">
          {data.students.map((s) => (
            <ListCard
              key={s.id}
              to={`/teacher/students/${s.id}`}
              icon={rankOf(s.points).emoji}
              title={s.name}
              subtitle={
                tt('overview.studentLine', { points: s.points, depth: pct(s.depth7), sessions: s.sessions7 }) +
                (s.diagnosticPre !== null
                  ? tt('overview.diagLine', { v: `${s.diagnosticPre}${s.diagnosticPost !== null ? `→${s.diagnosticPost}` : ''}` })
                  : '')
              }
              trailing={
                s.signal ? (
                  <span className="shrink-0 text-sm" title={tt(`signal.${s.signal}.hint`)}>
                    {SIGNAL_EMOJI[s.signal]} {tt(`signal.${s.signal}`)}
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
  const { t, tt, trich, err } = useTeacherI18n()
  const { pre, post, paired } = summary

  async function toggle() {
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const res = await teacherApi.setPostOpen(token, classId, !summary.postOpen)
      onChange({ ...summary, postOpen: res.postOpen })
    } catch (e) {
      setError(e instanceof ApiError ? err(e.message) : tt('diag.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h2 className="text-xl font-semibold">{tt('diag.title')}</h2>
      <p className="mt-1 text-sm text-muted">
        {tt('diag.about', { n: summary.postAfterSessions })}
        {summary.postOpen ? tt('diag.aboutOpen') : tt('diag.aboutClosed')}
      </p>

      {!pre ? (
        <p className="mt-4 rounded-2xl bg-primary-soft px-4 py-3 text-sm">{tt('diag.noPre')}</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 text-center">
            <Stat label={tt('diag.before')} value={tt('diag.of6', { v: num(pre.avg) })} sub={tt('diag.studentsN', { n: pre.count })} />
            <Stat
              label={tt('diag.after')}
              value={post ? tt('diag.of6', { v: num(post.avg) }) : '—'}
              sub={post ? tt('diag.studentsN', { n: post.count }) : tt('diag.nobody')}
            />
          </div>
          {paired && (
            <p className="mt-3 text-sm">
              {trich('diag.paired', { n: paired.count, change: <b>{num(paired.preAvg)} → {num(paired.postAvg)}</b> })}
            </p>
          )}
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 font-normal">{tt('diag.skill')}</th>
                <th className="py-1 text-right font-normal">{tt('diag.before')}</th>
                <th className="py-1 text-right font-normal">{tt('diag.after')}</th>
              </tr>
            </thead>
            <tbody>
              {SKILLS.map((s, i) => (
                <tr key={s} className="border-t border-line">
                  <td className="py-2">{t(`skill.${s}`)}</td>
                  <td className="py-2 text-right">{num(pre.skills[i])}</td>
                  <td className="py-2 text-right">{post ? num(post.skills[i]) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-muted">{tt('diag.skillNote')}</p>
        </>
      )}

      <Button variant="secondary" className="mt-4" loading={saving} onClick={toggle}>
        {summary.postOpen ? tt('diag.close') : tt('diag.open')}
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
