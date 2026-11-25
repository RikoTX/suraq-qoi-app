import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { classesApi, LANG_LABEL, type SchoolClass } from '../../api/classes'
import { KIND_LABEL, teacherTextsApi, TOPIC_EMOJI, TOPIC_LABEL, type ReadingText } from '../../api/texts'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { Button } from '../../components/Button'
import { Markdown } from '../../components/Markdown'

/** Общая библиотека: учитель выбирает готовые тексты и добавляет их в класс черновиками. */
export function LibraryPage() {
  const { classId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const [cls, setCls] = useState<SchoolClass | null>(null)
  const [texts, setTexts] = useState<ReadingText[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!token || !classId) return
    classesApi
      .students(token, classId)
      .then(({ class: c }) => {
        setCls(c)
        return teacherTextsApi.library(token, c.lang)
      })
      .then(setTexts)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить библиотеку'))
  }, [token, classId])

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function add() {
    if (!token || !classId) return
    setAdding(true)
    setError(null)
    try {
      await teacherTextsApi.fromLibrary(token, classId, [...picked])
      navigate(`/teacher/classes/${classId}?tab=texts`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось добавить')
      setAdding(false)
    }
  }

  return (
    <AppLayout
      back={`/teacher/classes/${classId}?tab=texts`}
      eyebrow={cls ? `Класс ${cls.name} · ${LANG_LABEL[cls.lang]}` : undefined}
      title="Библиотека текстов"
    >
      <p className="text-muted">
        Готовые тексты на языке класса. Отметьте нужные — они попадут в класс черновиками: прочитайте, при необходимости
        поправьте и опубликуйте.
      </p>
      {error && <p className="mt-6 rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>}
      {!texts && !error && <p className="mt-6 text-muted">Загрузка…</p>}
      {texts?.length === 0 && <p className="mt-6 rounded-3xl bg-primary-soft p-5 text-muted">Библиотека на этом языке пока пуста.</p>}

      <div className="mt-6 space-y-3 pb-24">
        {texts?.map((t) => {
          const on = picked.has(t.id)
          return (
            <div key={t.id} className={`rounded-3xl border-2 transition ${on ? 'border-primary bg-primary-soft' : 'border-line'}`}>
              <div className="flex items-center gap-3 p-3 pr-4">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`Выбрать «${t.title}»`}
                  onClick={() => toggle(t.id)}
                  className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg ${on ? 'bg-primary text-white' : 'bg-pink-soft'}`}
                >
                  {on ? '✓' : TOPIC_EMOJI[t.topic]}
                </button>
                <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium">{t.title}</span>
                  <span className="block truncate text-sm text-muted">
                    {TOPIC_LABEL[t.topic]} · {KIND_LABEL[t.kind]} · {'★'.repeat(t.difficulty)}
                  </span>
                </button>
                <span className="text-primary" aria-hidden>
                  {open === t.id ? '▴' : '▾'}
                </span>
              </div>
              {open === t.id && (
                <div className="border-t border-line px-5 py-4">
                  <Markdown source={t.body} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-white/90 px-6 py-4 backdrop-blur">
          <Button loading={adding} onClick={add}>
            Добавить в класс · {picked.size}
          </Button>
        </div>
      )}
    </AppLayout>
  )
}
