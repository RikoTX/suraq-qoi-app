import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { classesApi, LANG_LABEL, type ClassStudent, type SchoolClass } from '../../api/classes'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { ListCard } from '../../components/ListCard'
import { Tabs } from '../../components/Tabs'
import { ClassTexts } from './ClassTexts'
import { pluralStudents } from './plural'

/** Класс учителя: код для учеников, ученики и тексты класса. */
export function ClassPage() {
  const { id } = useParams()
  const { token } = useAuth()
  const [data, setData] = useState<{ class: SchoolClass; students: ClassStudent[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'texts' ? 'texts' : 'students'

  useEffect(() => {
    if (!token || !id) return
    classesApi
      .students(token, id)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить класс'))
  }, [token, id])

  const cls = data?.class

  async function removeStudent(s: ClassStudent) {
    if (!token || !id || !data) return
    if (!confirm(`Убрать «${s.name}» из класса ${data.class.name}?

Аккаунт ученика останется: он сможет снова вступить по коду, если это ошибка.`)) return
    setError(null)
    try {
      await classesApi.removeStudent(token, id, s.id)
      setData({ ...data, students: data.students.filter((x) => x.id !== s.id) })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось убрать ученика')
    }
  }

  async function copy() {
    if (!cls) return
    try {
      await navigator.clipboard.writeText(cls.joinCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* буфер недоступен — код и так виден */
    }
  }

  return (
    <AppLayout
      back="/"
      title={cls ? `Класс ${cls.name}` : 'Класс'}
      header={
        cls && (
          <div className="flex items-center justify-between gap-4 rounded-3xl bg-pink-soft p-5 text-ink">
            <div>
              <p className="text-sm text-muted">Код для учеников</p>
              <p className="mt-1 text-3xl font-semibold tracking-wider">{cls.joinCode}</p>
              <p className="mt-1 text-sm text-muted">{LANG_LABEL[cls.lang]}</p>
            </div>
            <button onClick={copy} className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-primary">
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
        )
      }
    >
      {error && <p className="rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>}
      {!data && !error && <p className="text-muted">Загрузка…</p>}

      {data && (
        <Tabs
          label="Раздел"
          value={tab}
          onChange={(t) => setParams(t === 'texts' ? { tab: 'texts' } : {}, { replace: true })}
          options={[
            { value: 'students', label: `Ученики · ${data.students.length}` },
            { value: 'texts', label: 'Тексты' },
          ]}
        />
      )}
      <div className="mt-6" />
      {data && tab === 'texts' && id && <ClassTexts classId={id} />}

      {data && tab === 'students' && (
        <>
          <h2 className="text-xl font-semibold">
            {data.students.length} {pluralStudents(data.students.length)}
          </h2>
          {data.students.length === 0 && (
            <p className="mt-4 rounded-3xl bg-primary-soft p-5 text-muted">
              Пока никого. Продиктуйте ученикам код <b className="text-ink">{data.class.joinCode}</b> — они введут
              его после регистрации.
            </p>
          )}
          <div className="mt-5 space-y-3">
            {data.students.map((s) => (
              <ListCard
                key={s.id}
                icon={s.name.slice(0, 1).toUpperCase()}
                title={s.name}
                subtitle={s.email}
                trailing={
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-medium text-primary">{s.points} очк.</span>
                    <button
                      type="button"
                      onClick={() => removeStudent(s)}
                      className="rounded-xl px-2 py-1 text-xs font-medium text-danger hover:bg-pink-soft"
                      aria-label={`Убрать ${s.name} из класса`}
                    >
                      Убрать
                    </button>
                  </span>
                }
              />
            ))}
          </div>
        </>
      )}
    </AppLayout>
  )
}
