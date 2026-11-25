import { sessionsApi, type SessionUpload, type UploadResponse } from '../api/sessions'
import { ApiError } from '../auth/api'
import { db, setMeta, type LocalQuestion, type LocalSession } from './db'
import { sendDiagnostics, usersWithDueDiagnostics } from './diagnostics'

/** Повтор отправки: 5 с, 15 с, 60 с, затем раз в 5 минут (ТЗ, 8). */
const BACKOFF_MS = [5_000, 15_000, 60_000, 300_000]
const BATCH = 20

/** Завершённая сессия сначала пишется на устройство и в очередь — потом уже отправляется. */
export async function saveSession(session: LocalSession, questions: LocalQuestion[]) {
  await db.transaction('rw', db.sessions, db.questions, db.outbox, async () => {
    await db.sessions.add(session)
    await db.questions.bulkAdd(questions)
    await db.outbox.add({ userId: session.userId, sessionId: session.id, attempts: 0, nextAt: 0 })
  })
}

let running: Promise<void> | null = null

/**
 * Отправляет очередь всех учеников на устройстве — каждого с его токеном (ТЗ, 7.0.2).
 * force — не ждать задержки (ученик только что закончил сессию, появилась сеть).
 */
export function flushOutbox(force = false): Promise<void> {
  running ??= run(force).finally(() => (running = null))
  return running
}

async function run(force: boolean) {
  const now = Date.now()
  const due = (await db.outbox.toArray()).filter((i) => force || i.nextAt <= now)
  const byUser = new Map<string, typeof due>()
  for (const item of due) byUser.set(item.userId, [...(byUser.get(item.userId) ?? []), item])
  for (const userId of await usersWithDueDiagnostics(force)) if (!byUser.has(userId)) byUser.set(userId, [])
  for (const [userId, items] of byUser) {
    const profile = await db.profiles.get(userId)
    if (!profile) continue
    for (let i = 0; i < items.length; i += BATCH) {
      await sendBatch(profile.auth.token, userId, items.slice(i, i + BATCH).map((x) => x.sessionId))
    }
    // Мини-диагностика (ТЗ, 11.1) — той же очередью, с тем же токеном ученика.
    await sendDiagnostics(profile.auth.token, userId, force)
  }
}

async function sendBatch(token: string, userId: string, sessionIds: string[]) {
  const sessions = (await db.sessions.bulkGet(sessionIds)).filter((s) => s !== undefined)
  const questions = await db.questions.where('sessionId').anyOf(sessionIds).toArray()
  const uploads: SessionUpload[] = sessions.map((s) => ({
    id: s.id,
    textId: s.textId,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    conclusion: s.conclusion,
    questions: questions
      .filter((q) => q.sessionId === s.id)
      .map((q) => ({ id: q.id, position: q.position, body: q.body, levelLocal: q.levelLocal, createdAt: q.createdAt })),
  }))

  try {
    await apply(userId, await sessionsApi.upload(token, uploads))
  } catch (e) {
    // Нет сети, таймаут, сервер упал, токен истёк — сессии остаются в очереди, повторим позже.
    const status = e instanceof ApiError ? e.status : 0
    await db.outbox
      .where('sessionId')
      .anyOf(sessionIds)
      .modify((item) => {
        item.attempts++
        item.nextAt = Date.now() + BACKOFF_MS[Math.min(item.attempts - 1, BACKOFF_MS.length - 1)] * (status === 401 ? 4 : 1)
      })
  }
}

/** Оценки сервера заменяют предварительные; оценённые и отклонённые сессии уходят из очереди. */
async function apply(userId: string, res: UploadResponse) {
  await db.transaction('rw', [db.sessions, db.questions, db.outbox, db.meta], async () => {
    for (const g of res.graded) {
      await db.questions.update(
        g.questionId,
        g.byTeacher
          ? { levelTeacher: g.level, comment: g.comment, hint: g.hint }
          : { levelAi: g.level, levelTeacher: null, comment: g.comment, hint: g.hint },
      )
    }
    const done = new Set(res.rejected)
    for (const s of res.sessions) {
      await db.sessions.update(s.id, {
        points: s.points,
        conclusionScore: s.conclusionScore,
        conclusionComment: s.conclusionComment,
      })
      // Сервер принял, но ИИ не успел оценить — оставляем в очереди: при следующей отправке оценит.
      if (!s.pending) done.add(s.id)
    }
    const pending = res.sessions.filter((s) => s.pending).map((s) => s.id)
    await db.outbox.where('sessionId').anyOf([...done]).delete()
    await db.outbox
      .where('sessionId')
      .anyOf(pending)
      .modify((item) => {
        item.attempts++
        item.nextAt = Date.now() + BACKOFF_MS[Math.min(item.attempts - 1, BACKOFF_MS.length - 1)]
      })
    await setMeta(`progress:${userId}`, JSON.stringify(res.student))
  })
}

/** Фоновая синхронизация: при запуске, при появлении сети и по таймеру (с учётом задержек). */
export function startOutboxSync(): () => void {
  const kick = () => void flushOutbox()
  const online = () => void flushOutbox(true)
  kick()
  window.addEventListener('online', online)
  const timer = window.setInterval(kick, 5_000)
  return () => {
    window.removeEventListener('online', online)
    window.clearInterval(timer)
  }
}
