import type { AuthResponse } from '../auth/api'
import { db, pruneTexts, type Profile } from './db'

/** Сколько минут после ввода PIN можно переключаться на ученика без повторного PIN. */
export const UNLOCK_MINUTES = 30

export async function hashPin(userId: string, pin: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}:${pin}`))
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Запомнить ученика на устройстве после входа по PIN. */
export async function saveProfile(auth: AuthResponse, pin: string | null, cls?: { id: string; name: string } | null) {
  const prev = await db.profiles.get(auth.user.id)
  await db.profiles.put({
    userId: auth.user.id,
    name: auth.user.name,
    classId: cls?.id ?? prev?.classId ?? null,
    className: cls?.name ?? prev?.className ?? null,
    auth,
    pinHash: pin ? await hashPin(auth.user.id, pin) : (prev?.pinHash ?? null),
    lastUnlockAt: Date.now(),
  })
}

/** Класс ученика изменился (вступил, убрали) — обновляем профиль и чистим тексты чужих классов. */
export async function updateProfileClass(userId: string, cls: { id: string; name: string } | null) {
  await db.profiles.update(userId, { classId: cls?.id ?? null, className: cls?.name ?? null })
  await pruneTexts()
}

export function needsPin(p: Profile) {
  return p.pinHash !== null && Date.now() - p.lastUnlockAt > UNLOCK_MINUTES * 60_000
}

/** Проверка PIN без сети. true — PIN верный, профиль разблокирован. */
export async function unlockProfile(p: Profile, pin: string): Promise<boolean> {
  if (p.pinHash !== (await hashPin(p.userId, pin))) return false
  await db.profiles.update(p.userId, { lastUnlockAt: Date.now() })
  return true
}

/** Неотправленные сессии ученика: пока они есть, убрать его с устройства нельзя. */
export function pendingCount(userId: string) {
  return db.outbox.where('userId').equals(userId).count()
}

/** Убрать ученика с устройства вместе с его сессиями. */
export async function removeProfile(userId: string) {
  await db.transaction('rw', [db.profiles, db.sessions, db.questions, db.outbox, db.meta], async () => {
    const sessionIds = await db.sessions.where('userId').equals(userId).primaryKeys()
    await db.questions.where('sessionId').anyOf(sessionIds).delete()
    await db.sessions.bulkDelete(sessionIds)
    await db.outbox.where('userId').equals(userId).delete()
    await db.meta.bulkDelete([`studentMe:${userId}`, `progress:${userId}`])
    await db.profiles.delete(userId)
  })
  await pruneTexts()
}
