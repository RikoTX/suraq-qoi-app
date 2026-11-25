import { Link } from 'react-router'
import { useI18n } from '../../i18n/useI18n'
import type { DiagnosticPlan } from '../../offline/diagnostics'

/** Карточка мини-диагностики на главной ученика (ТЗ, 11.1). */
export function DiagnosticCard({ plan }: { plan: DiagnosticPlan }) {
  const { t } = useI18n()
  if (!plan.next) return null
  const pre = plan.next.kind === 'pre'
  return (
    <section className="rounded-3xl bg-primary p-5 text-white">
      <p className="text-sm text-white/70">{pre ? t('diag.cardPre') : t('diag.cardPost')}</p>
      <h2 className="mt-1 text-xl font-semibold">{pre ? t('diag.cardPreTitle') : t('diag.cardPostTitle')}</h2>
      <p className="mt-2 text-sm text-white/80">
        {t('diag.cardAbout')} {pre ? t('diag.cardPreHint') : t('diag.cardPostHint')}
      </p>
      <Link
        to={`/diagnostic/${plan.next.kind}`}
        className="mt-4 block rounded-2xl bg-white px-6 py-3 text-center font-medium text-primary hover:bg-white/90"
      >
        {t('diag.start')}
      </Link>
    </section>
  )
}
