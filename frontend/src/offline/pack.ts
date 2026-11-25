import { packApi } from '../api/texts'
import { db, getMeta, setMeta } from './db'

const versionKey = (classId: string) => `packVersion:${classId}`

/**
 * Обновляет тексты класса на устройстве. Скачивает только новое (since = версия прошлого пакета)
 * и удаляет тексты класса, снятые с публикации. Без сети просто бросает ApiError —
 * экраны продолжают работать с тем, что уже лежит в IndexedDB.
 */
export async function syncPack(token: string, classId: string): Promise<{ added: number }> {
  const pack = await packApi.get(token, await getMeta(versionKey(classId)))

  await db.transaction('rw', db.texts, db.meta, async () => {
    if (pack.texts.length) await db.texts.bulkPut(pack.texts)
    const keep = new Set(pack.ids)
    const stale = (await db.texts.where('classId').equals(classId).primaryKeys()).filter((id) => !keep.has(id))
    if (stale.length) await db.texts.bulkDelete(stale)
    await setMeta(versionKey(classId), pack.version)
  })

  return { added: pack.texts.length }
}
