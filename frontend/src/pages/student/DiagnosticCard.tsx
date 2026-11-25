import { Link } from 'react-router'
import type { DiagnosticPlan } from '../../offline/diagnostics'

/** Карточка мини-диагностики на главной ученика (ТЗ, 11.1). */
export function DiagnosticCard({ plan }: { plan: DiagnosticPlan }) {
  if (!plan.next) return null
  const pre = plan.next.kind === 'pre'
  return (
    <section className="rounded-3xl bg-primary p-5 text-white">
      <p className="text-sm text-white/70">{pre ? 'Сначала — короткая проверка' : 'Итоговая проверка открыта'}</p>
      <h2 className="mt-1 text-xl font-semibold">{pre ? 'Как ты читаешь сейчас?' : 'Что изменилось?'}</h2>
      <p className="mt-2 text-sm text-white/80">
        2 текста и 6 вопросов с выбором ответа, около 10 минут.{' '}
        {pre ? 'После неё откроются тексты.' : 'Учитель сравнит результат со входной проверкой.'}
      </p>
      <Link
        to={`/diagnostic/${plan.next.kind}`}
        className="mt-4 block rounded-2xl bg-white px-6 py-3 text-center font-medium text-primary hover:bg-white/90"
      >
        Начать
      </Link>
    </section>
  )
}
