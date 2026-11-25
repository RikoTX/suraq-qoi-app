import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { TOPIC_EMOJI } from '../../api/texts'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { ListCard } from '../../components/ListCard'
import { useI18n } from '../../i18n/useI18n'
import { db } from '../../offline/db'
import { syncPack } from '../../offline/pack'

type SyncState = 'syncing' | 'ok' | 'offline'

/** Тексты ученика: показываем то, что уже на устройстве, и тихо докачиваем новое. */
export function TextList({ classId }: { classId: string }) {
  const { token } = useAuth()
  const texts = useLiveQuery(() => db.texts.where('classId').equals(classId).sortBy('difficulty'), [classId])
  const [sync, setSync] = useState<SyncState>('syncing')
  const { t } = useI18n()

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const run = () => {
      setSync('syncing')
      syncPack(token, classId)
        .then(() => !cancelled && setSync('ok'))
        .catch((e) => !cancelled && setSync(e instanceof ApiError && !e.offline ? 'ok' : 'offline'))
    }
    run()
    window.addEventListener('online', run)
    return () => {
      cancelled = true
      window.removeEventListener('online', run)
    }
  }, [token, classId])

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t('texts.title')}</h2>
        <span className="text-sm text-muted">
          {sync === 'syncing' ? t('texts.syncing') : sync === 'offline' ? t('texts.offline') : t('texts.onPhone', { n: texts?.length ?? 0 })}
        </span>
      </div>

      {texts?.length === 0 && sync !== 'syncing' && (
        <p className="mt-4 rounded-3xl bg-primary-soft p-5 text-muted">
          {sync === 'offline' ? t('texts.notDownloaded') : t('texts.none')}
        </p>
      )}

      <div className="mt-5 space-y-3">
        {texts?.map((x) => (
          <ListCard
            key={x.id}
            to={`/texts/${x.id}`}
            icon={TOPIC_EMOJI[x.topic]}
            title={x.title}
            subtitle={`${t(`topic.${x.topic}` as const)} · ${t(`kind.${x.kind}` as const)} · ${'★'.repeat(x.difficulty)}`}
          />
        ))}
      </div>
    </section>
  )
}
