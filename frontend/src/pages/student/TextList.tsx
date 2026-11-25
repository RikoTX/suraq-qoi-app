import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { KIND_LABEL, TOPIC_EMOJI, TOPIC_LABEL } from '../../api/texts'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { ListCard } from '../../components/ListCard'
import { db } from '../../offline/db'
import { syncPack } from '../../offline/pack'

type SyncState = 'syncing' | 'ok' | 'offline'

/** Тексты ученика: показываем то, что уже на устройстве, и тихо докачиваем новое. */
export function TextList({ lang }: { lang: string }) {
  const { token } = useAuth()
  const texts = useLiveQuery(() => db.texts.where('lang').equals(lang).sortBy('difficulty'), [lang])
  const [sync, setSync] = useState<SyncState>('syncing')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const run = () => {
      setSync('syncing')
      syncPack(token, lang)
        .then(() => !cancelled && setSync('ok'))
        .catch((e) => !cancelled && setSync(e instanceof ApiError && !e.offline ? 'ok' : 'offline'))
    }
    run()
    window.addEventListener('online', run)
    return () => {
      cancelled = true
      window.removeEventListener('online', run)
    }
  }, [token, lang])

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Тексты</h2>
        <span className="text-sm text-muted">
          {sync === 'syncing' ? 'Обновляем…' : sync === 'offline' ? 'Нет связи · офлайн' : `${texts?.length ?? 0} на телефоне`}
        </span>
      </div>

      {texts?.length === 0 && sync !== 'syncing' && (
        <p className="mt-4 rounded-3xl bg-primary-soft p-5 text-muted">
          {sync === 'offline'
            ? 'Тексты ещё не скачаны. Подключитесь к интернету один раз — дальше они будут открываться и без него.'
            : 'Учитель скоро добавит тексты. Загляните позже.'}
        </p>
      )}

      <div className="mt-5 space-y-3">
        {texts?.map((t) => (
          <ListCard
            key={t.id}
            to={`/texts/${t.id}`}
            icon={TOPIC_EMOJI[t.topic]}
            title={t.title}
            subtitle={`${TOPIC_LABEL[t.topic]} · ${KIND_LABEL[t.kind]} · ${'★'.repeat(t.difficulty)}`}
          />
        ))}
      </div>
    </section>
  )
}
