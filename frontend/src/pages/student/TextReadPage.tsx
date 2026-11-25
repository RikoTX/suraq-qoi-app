import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { Button } from '../../components/Button'
import { Markdown } from '../../components/Markdown'
import { useI18n } from '../../i18n/useI18n'
import { db } from '../../offline/db'

/** Чтение текста из памяти устройства — работает без интернета. Дальше — вопросы к тексту. */
export function TextReadPage() {
  const { id } = useParams()
  // undefined — ещё читаем из IndexedDB, null — текста нет на устройстве
  const text = useLiveQuery(async () => (id ? ((await db.texts.get(id)) ?? null) : null), [id])
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t, date } = useI18n()
  const past = useLiveQuery(
    async () =>
      id && user
        ? (await db.sessions.where('textId').equals(id).filter((s) => s.userId === user.id).toArray()).sort((a, b) =>
            b.finishedAt.localeCompare(a.finishedAt),
          )
        : [],
    [id, user],
  )

  return (
    <AppLayout
      back="/"
      title={text?.title ?? (text === null ? t('text.notFound') : '')}
      header={
        text && (
          <div className="flex flex-wrap gap-2 text-sm">
            {[t(`topic.${text.topic}` as const), t(`kind.${text.kind}` as const), '★'.repeat(text.difficulty)].map((x) => (
              <span key={x} className="rounded-full bg-white/15 px-3 py-1">
                {x}
              </span>
            ))}
          </div>
        )
      }
    >
      {text === null && <p className="text-muted">{t('text.notOnDevice')}</p>}
      {text && (
        <>
          <Markdown source={text.body} />
          <div className="mt-8 rounded-3xl bg-primary-soft p-5">
            <p className="font-semibold text-primary">{t('text.readIt')}</p>
            <p className="mt-1 text-muted">{t('text.askHint')}</p>
            <Button className="mt-4" onClick={() => navigate(`/texts/${text.id}/ask`)}>
              {t('text.ask')}
            </Button>
          </div>
          {past && past.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-medium text-muted">{t('text.askedBefore')}</p>
              <ul className="mt-2 space-y-2">
                {past.map((s) => (
                  <li key={s.id}>
                    <Link to={`/results/${s.id}`} className="block rounded-2xl border-2 border-line px-4 py-3 text-sm hover:border-primary/40">
                      {t('text.seeResult', { date: date(s.finishedAt) })}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </AppLayout>
  )
}
