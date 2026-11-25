import Dexie, { type EntityTable } from 'dexie'
import type { ReadingText } from '../api/texts'
import type { AuthResponse } from '../auth/api'

interface Meta {
  key: string
  value: string | null
}

/**
 * Ученик, который уже входил на этом устройстве (ТЗ, 7.0.2). Один телефон — несколько детей:
 * у каждого свой токен, свои сессии и своя очередь отправки.
 */
export interface Profile {
  /** id пользователя (sub в токене) */
  userId: string
  name: string
  classId: string | null
  className: string | null
  auth: AuthResponse
  /** SHA-256(userId:PIN) — чтобы сменить ученика без сети. Не защита, а «чужой не зайдёт случайно». */
  pinHash: string | null
  /** Когда последний раз вводили PIN; в течение 30 минут повторно не спрашиваем. */
  lastUnlockAt: number
}

/** Сессия «Обыграй ИИ» на устройстве (ТЗ, разделы 7.1 и 8). id генерирует клиент. */
export interface LocalSession {
  id: string
  userId: string
  textId: string
  textTitle: string
  startedAt: string
  finishedAt: string
  conclusion: string | null
  /** Предварительная оценка вывода правилами, 0–20 */
  conclusionScoreLocal: number
  /** Оценка вывода ИИ, 0–20; null — ещё не пришла */
  conclusionScore: number | null
  conclusionComment: string | null
  /** Очки сессии от сервера; null — ещё не синхронизирована */
  points: number | null
}

export interface LocalQuestion {
  id: string
  sessionId: string
  position: number
  body: string
  /** Уровень по правилам на устройстве, 0–2 (раздел 9.3) */
  levelLocal: number
  /** Уровень от ИИ, 0–4; null — ещё не оценён */
  levelAi: number | null
  /** Уровень, поставленный учителем; важнее оценки ИИ */
  levelTeacher: number | null
  comment: string | null
  hint: string | null
  createdAt: string
}

/** Очередь отправки: сессия ждёт, пока сервер её примет и оценит. */
export interface OutboxItem {
  seq?: number
  userId: string
  sessionId: string
  attempts: number
  /** Не раньше этого времени (мс) — экспоненциальная задержка */
  nextAt: number
}

/** Локальная база ученика (ТЗ, раздел 8). */
export const db = new Dexie('suraq-qoi') as Dexie & {
  profiles: EntityTable<Profile, 'userId'>
  texts: EntityTable<ReadingText, 'id'>
  sessions: EntityTable<LocalSession, 'id'>
  questions: EntityTable<LocalQuestion, 'id'>
  outbox: EntityTable<OutboxItem, 'seq'>
  meta: EntityTable<Meta, 'key'>
}

db.version(1).stores({
  texts: 'id, lang, difficulty, topic',
  meta: 'key',
})

// v2: несколько учеников на устройстве, сессии, очередь отправки. Тексты — по классам.
db.version(2)
  .stores({
    profiles: 'userId',
    texts: 'id, classId, lang, difficulty, topic',
    sessions: 'id, userId, textId, finishedAt',
    questions: 'id, sessionId',
    outbox: '++seq, userId, sessionId',
    meta: 'key',
  })
  .upgrade(async (tx) => {
    // Пакет v1 хранил версию без класса — скачаем заново.
    await tx.table('meta').bulkDelete(['packVersion', 'packLang', 'studentMe'])
  })

export async function getMeta(key: string): Promise<string | null> {
  return (await db.meta.get(key))?.value ?? null
}

export async function setMeta(key: string, value: string | null) {
  await db.meta.put({ key, value })
}

/** Тексты классов, к которым не относится ни один ученик на устройстве (например, ученика убрали из класса). */
export async function pruneTexts() {
  const classIds = new Set((await db.profiles.toArray()).map((p) => p.classId).filter(Boolean))
  await db.transaction('rw', db.texts, db.meta, async () => {
    const stale = await db.texts.filter((t) => !t.classId || !classIds.has(t.classId)).primaryKeys()
    if (stale.length) await db.texts.bulkDelete(stale)
    const metaKeys = (await db.meta.toCollection().primaryKeys()).filter(
      (k) => k.startsWith('packVersion:') && !classIds.has(k.slice('packVersion:'.length)),
    )
    if (metaKeys.length) await db.meta.bulkDelete(metaKeys)
  })
}
