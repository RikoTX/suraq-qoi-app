import { diagnosticsApi, SKILLS, type DiagnosticForm, type DiagnosticKind, type DiagnosticStatus } from '../api/diagnostics'
import { ApiError } from '../auth/api'
import { db, getMeta, setMeta, type LocalDiagnostic } from './db'

/**
 * Мини-диагностика на устройстве (ТЗ, 11.1): задания приходят заранее вместе со статусом,
 * проверка — здесь же, результат уходит через очередь, как и сессии.
 */

const BACKOFF_MS = [5_000, 15_000, 60_000, 300_000]
const statusKey = (userId: string) => `diagnostic:${userId}`

/** Статус с сервера; без сети — сохранённый с прошлого раза (или null). */
export async function loadStatus(token: string, userId: string): Promise<DiagnosticStatus | null> {
  try {
    const status = await diagnosticsApi.status(token)
    await setMeta(statusKey(userId), JSON.stringify(status))
    return status
  } catch (e) {
    if (e instanceof ApiError && !e.offline) throw e
    return cachedStatus(userId)
  }
}

export async function cachedStatus(userId: string): Promise<DiagnosticStatus | null> {
  const raw = await getMeta(statusKey(userId))
  return raw ? (JSON.parse(raw) as DiagnosticStatus) : null
}

export function score(form: DiagnosticForm, answers: number[]) {
  const tasks = form.texts.flatMap((t) => t.tasks)
  const skills = SKILLS.map(() => 0)
  let total = 0
  tasks.forEach((t, i) => {
    if (answers[i] !== t.answer) return
    total++
    skills[SKILLS.indexOf(t.skill)]++
  })
  return { score: total, skills }
}

export interface DiagnosticPlan {
  /** что пройти сейчас; null — ничего */
  next: DiagnosticForm | null
  /** входная обязательна до первого текста */
  blocking: boolean
  pre: { score: number; skills: number[] } | null
  post: { score: number; skills: number[] } | null
}

/**
 * Решает, что показать ученику: входную — пока он не открыл ни одного текста,
 * итоговую — после N сессий (считаем и ещё не отправленные) или когда учитель открыл её классу.
 */
export function plan(status: DiagnosticStatus | null, local: LocalDiagnostic[], localSessions: number): DiagnosticPlan {
  const localOf = (kind: DiagnosticKind) => local.find((d) => d.kind === kind) ?? null
  const pre = status?.pre ?? localOf('pre')
  const post = status?.post ?? localOf('post')
  const result = { pre: pre && { score: pre.score, skills: pre.skills }, post: post && { score: post.score, skills: post.skills } }
  if (!status) return { next: null, blocking: false, ...result }

  const preForm = status.forms.find((f) => f.kind === 'pre')
  if (!pre && preForm && status.sessions === 0 && localSessions === 0) return { next: preForm, blocking: true, ...result }

  const postForm = status.forms.find((f) => f.kind === 'post')
  const sessions = Math.max(status.sessions, localSessions)
  if (pre && !post && postForm && (status.postOpen || sessions >= status.postAfterSessions))
    return { next: postForm, blocking: false, ...result }

  return { next: null, blocking: false, ...result }
}

/** Отправляет непереданные результаты ученика. Ошибка сети — повтор позже с задержкой. */
export async function sendDiagnostics(token: string, userId: string, force: boolean) {
  const now = Date.now()
  const due = await db.diagnostics
    .where('userId')
    .equals(userId)
    .filter((d) => !d.synced && (force || d.nextAt <= now))
    .toArray()
  for (const d of due) {
    try {
      const res = await diagnosticsApi.submit(token, {
        id: d.id,
        kind: d.kind,
        form: d.form,
        lang: d.lang,
        answers: d.answers,
        startedAt: d.startedAt,
        finishedAt: d.finishedAt,
      })
      await db.diagnostics.update(d.id, { synced: true, score: res.score, skills: res.skills })
    } catch (e) {
      // 400 — сервер такой результат не примет никогда: не повторяем, но и не стираем с устройства.
      if (e instanceof ApiError && e.status === 400) {
        await db.diagnostics.update(d.id, { synced: true })
        continue
      }
      const attempts = d.attempts + 1
      await db.diagnostics.update(d.id, { attempts, nextAt: Date.now() + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] })
    }
  }
}

/** Пользователи, у которых есть что отправить. */
export async function usersWithDueDiagnostics(force: boolean): Promise<string[]> {
  const now = Date.now()
  const due = await db.diagnostics.filter((d) => !d.synced && (force || d.nextAt <= now)).toArray()
  return [...new Set(due.map((d) => d.userId))]
}
