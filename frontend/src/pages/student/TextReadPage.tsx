import { useLiveQuery } from 'dexie-react-hooks'
import { useParams } from 'react-router'
import { KIND_LABEL, TOPIC_LABEL } from '../../api/texts'
import { AppLayout } from '../../components/AppLayout'
import { Markdown } from '../../components/Markdown'
import { db } from '../../offline/db'

/** Чтение текста из памяти устройства — работает без интернета. Вопросы к тексту — этап 4. */
export function TextReadPage() {
  const { id } = useParams()
  // undefined — ещё читаем из IndexedDB, null — текста нет на устройстве
  const text = useLiveQuery(async () => (id ? ((await db.texts.get(id)) ?? null) : null), [id])

  return (
    <AppLayout
      back="/"
      title={text?.title ?? (text === null ? 'Текст не найден' : '')}
      header={
        text && (
          <div className="flex flex-wrap gap-2 text-sm">
            {[TOPIC_LABEL[text.topic], KIND_LABEL[text.kind], '★'.repeat(text.difficulty)].map((x) => (
              <span key={x} className="rounded-full bg-white/15 px-3 py-1">
                {x}
              </span>
            ))}
          </div>
        )
      }
    >
      {text === null && <p className="text-muted">Этого текста нет на устройстве. Вернитесь к списку и обновите его.</p>}
      {text && (
        <>
          <Markdown source={text.body} />
          <div className="mt-8 rounded-3xl bg-primary-soft p-5">
            <p className="font-semibold text-primary">Скоро: задай вопрос к тексту</p>
            <p className="mt-1 text-muted">Придумай вопрос, на который ответ нельзя просто найти в тексте, — так ты обыграешь ИИ.</p>
          </div>
        </>
      )}
    </AppLayout>
  )
}
