import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import type { DiagnosticStatus } from '../../api/diagnostics'
import { db } from '../../offline/db'
import { cachedStatus, loadStatus, plan, type DiagnosticPlan } from '../../offline/diagnostics'

/**
 * Мини-диагностика на главной ученика (ТЗ, 11.1). Входная — до первого текста (тексты скрыты),
 * итоговая — карточкой сверху. plan.blocking говорит главной, прятать ли тексты.
 */
export function useDiagnosticPlan(userId: string, token: string | null): DiagnosticPlan | undefined {
  const [status, setStatus] = useState<DiagnosticStatus | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    void cachedStatus(userId).then((s) => alive && setStatus((cur) => (cur === undefined ? s : cur)))
    if (token) void loadStatus(token, userId).then((s) => alive && setStatus(s)).catch(() => {})
    return () => {
      alive = false
    }
  }, [userId, token])

  const local = useLiveQuery(async () => {
    const [diagnostics, sessions] = await Promise.all([
      db.diagnostics.where('userId').equals(userId).toArray(),
      db.sessions.where('userId').equals(userId).count(),
    ])
    return { diagnostics, sessions }
  }, [userId])

  if (status === undefined || !local) return undefined
  return plan(status, local.diagnostics, local.sessions)
}
