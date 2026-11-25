import { packApi } from '../api/texts'
import { db, getMeta, setMeta } from './db'

const VERSION_KEY = 'packVersion'
const LANG_KEY = 'packLang'

/**
 * Обновляет тексты на устройстве. Скачивает только новое (since = версия прошлого пакета)
 * и удаляет тексты, снятые с публикации. Без сети просто бросает ApiError —
 * экраны продолжают работать с тем, что уже лежит в IndexedDB.
 */
export async function syncPack(token: string, lang: string): Promise<{ added: number }> {
  // Сменился язык класса — пакет собираем заново.
  if ((await getMeta(LANG_KEY)) !== lang) {
    await db.texts.clear()
    await setMeta(VERSION_KEY, null)
  }

  const pack = await packApi.get(token, await getMeta(VERSION_KEY))

  await db.transaction('rw', db.texts, db.meta, async () => {
    if (pack.texts.length) await db.texts.bulkPut(pack.texts)
    const keep = new Set(pack.ids)
    const stale = (await db.texts.toCollection().primaryKeys()).filter((id) => !keep.has(id))
    if (stale.length) await db.texts.bulkDelete(stale)
    await setMeta(VERSION_KEY, pack.version)
    await setMeta(LANG_KEY, lang)
  })

  return { added: pack.texts.length }
}
