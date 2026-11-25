import Dexie, { type EntityTable } from 'dexie'
import type { ReadingText } from '../api/texts'

interface Meta {
  key: string
  value: string | null
}

/** Локальная база ученика (ТЗ, раздел 8). Сессии и очередь отправки добавятся на этапах 4–5. */
export const db = new Dexie('suraq-qoi') as Dexie & {
  texts: EntityTable<ReadingText, 'id'>
  meta: EntityTable<Meta, 'key'>
}

db.version(1).stores({
  texts: 'id, lang, difficulty, topic',
  meta: 'key',
})

export async function getMeta(key: string): Promise<string | null> {
  return (await db.meta.get(key))?.value ?? null
}

export async function setMeta(key: string, value: string | null) {
  await db.meta.put({ key, value })
}

/** Тексты класса и версия пакета — например, когда ученика убрали из класса. */
export async function clearTexts() {
  await db.transaction('rw', db.texts, db.meta, async () => {
    await db.texts.clear()
    await db.meta.bulkDelete(['packVersion', 'packLang'])
  })
}

/** При выходе стираем данные ученика с устройства — телефон может быть общим. */
export async function clearLocalData() {
  await Promise.all([db.texts.clear(), db.meta.clear()])
}
