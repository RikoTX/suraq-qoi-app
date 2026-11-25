import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { classesApi, LANG_LABEL, type SchoolClass } from '../../api/classes'
import { teacherTextsApi, TOPIC_EMOJI, type ReadingText } from '../../api/texts'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { Button } from '../../components/Button'
import { Markdown } from '../../components/Markdown'
import { useTeacherI18n } from './useTeacherI18n'

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
  const { t, tt, err } = useTeacherI18n()

  useEffect(() => {
    if (!token || !classId) return
    classesApi
      .students(token, classId)
      .then(({ class: c }) => {
        setCls(c)
        return teacherTextsApi.library(token, c.lang)
      })
      .then(setTexts)
      .catch((e) => setError(e instanceof ApiError ? err(e.message) : tt('library.loadError')))
  }, [token, classId, err, tt])

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
    } catch (e) {
      setError(e instanceof ApiError ? err(e.message) : tt('library.addError'))
      setAdding(false)
    }
  }

  return (
    <AppLayout
      back={`/teacher/classes/${classId}?tab=texts`}
      eyebrow={cls ? `${tt('class.title', { name: cls.name })} · ${LANG_LABEL[cls.lang]}` : undefined}
      title={tt('library.title')}
    >
      <p className="text-muted">{tt('library.intro')}</p>
      {error && <p className="mt-6 rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>}
      {!texts && !error && <p className="mt-6 text-muted">{t('common.loading')}</p>}
      {texts?.length === 0 && <p className="mt-6 rounded-3xl bg-primary-soft p-5 text-muted">{tt('library.empty')}</p>}

      <div className="mt-6 space-y-3 pb-24">
        {texts?.map((x) => {
          const on = picked.has(x.id)
          return (
            <div key={x.id} className={`rounded-3xl border-2 transition ${on ? 'border-primary bg-primary-soft' : 'border-line'}`}>
              <div className="flex items-center gap-3 p-3 pr-4">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={tt('library.pick', { title: x.title })}
                  onClick={() => toggle(x.id)}
                  className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg ${on ? 'bg-primary text-white' : 'bg-pink-soft'}`}
                >
                  {on ? '✓' : TOPIC_EMOJI[x.topic]}
                </button>
                <button type="button" onClick={() => setOpen(open === x.id ? null : x.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium">{x.title}</span>
                  <span className="block truncate text-sm text-muted">
                    {t(`topic.${x.topic}`)} · {t(`kind.${x.kind}`)} · {'★'.repeat(x.difficulty)}
                  </span>
                </button>
                <span className="text-primary" aria-hidden>
                  {open === x.id ? '▴' : '▾'}
                </span>
              </div>
              {open === x.id && (
                <div className="border-t border-line px-5 py-4">
                  <Markdown source={x.body} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-white/90 px-6 py-4 backdrop-blur">
          <Button loading={adding} onClick={add}>
            {tt('library.add', { n: picked.size })}
          </Button>
        </div>
      )}
    </AppLayout>
  )
}
