import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { classesApi, LANG_LABEL, type ClassStudent, type SchoolClass } from '../../api/classes'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { ListCard } from '../../components/ListCard'
import { Tabs } from '../../components/Tabs'
import { ClassOverview } from './ClassOverview'
import { ClassTexts } from './ClassTexts'
import { useTeacherI18n } from './useTeacherI18n'

/** Класс учителя: код для учеников, ученики и тексты класса. */
export function ClassPage() {
  const { id } = useParams()
  const { token } = useAuth()
  const [data, setData] = useState<{ class: SchoolClass; students: ClassStudent[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab = tabParam === 'texts' || tabParam === 'skills' ? tabParam : 'students'
  const { t, tt, trich, err, students: studentsN } = useTeacherI18n()

  useEffect(() => {
    if (!token || !id) return
    classesApi
      .students(token, id)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? err(e.message) : tt('class.loadError')))
  }, [token, id, err, tt])

  const cls = data?.class

  async function removeStudent(s: ClassStudent) {
    if (!token || !id || !data) return
    if (!confirm(tt('class.removeConfirm', { name: s.name, cls: data.class.name }))) return
    setError(null)
    try {
      await classesApi.removeStudent(token, id, s.id)
      setData({ ...data, students: data.students.filter((x) => x.id !== s.id) })
    } catch (e) {
      setError(e instanceof ApiError ? err(e.message) : tt('class.removeError'))
    }
  }

  async function resetPin(s: ClassStudent) {
    if (!token || !id) return
    if (!confirm(tt('class.resetConfirm', { name: s.name }))) return
    setError(null)
    try {
      const { pin } = await classesApi.resetPin(token, id, s.id)
      alert(tt('class.newPinAlert', { name: s.name, pin }))
    } catch (e) {
      setError(e instanceof ApiError ? err(e.message) : tt('class.resetError'))
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
      title={cls ? tt('class.title', { name: cls.name }) : tt('class.titleEmpty')}
      header={
        cls && (
          <div className="flex items-center justify-between gap-4 rounded-3xl bg-pink-soft p-5 text-ink">
            <div>
              <p className="text-sm text-muted">{tt('class.codeForStudents')}</p>
              <p className="mt-1 text-3xl font-semibold tracking-wider">{cls.joinCode}</p>
              <p className="mt-1 text-sm text-muted">{LANG_LABEL[cls.lang]}</p>
            </div>
            <button onClick={copy} className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-primary">
              {copied ? tt('class.copied') : tt('class.copy')}
            </button>
          </div>
        )
      }
    >
      {error && <p className="rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>}
      {!data && !error && <p className="text-muted">{t('common.loading')}</p>}

      {data && (
        <Tabs
          label={tt('class.section')}
          value={tab}
          onChange={(x) => setParams(x === 'students' ? {} : { tab: x }, { replace: true })}
          options={[
            { value: 'students', label: tt('class.tabStudents', { n: data.students.length }) },
            { value: 'skills', label: tt('class.tabSkills') },
            { value: 'texts', label: tt('class.tabTexts') },
          ]}
        />
      )}
      <div className="mt-6" />
      {data && tab === 'texts' && id && <ClassTexts classId={id} />}
      {data && tab === 'skills' && id && <ClassOverview classId={id} />}

      {data && tab === 'students' && (
        <>
          <h2 className="text-xl font-semibold">{studentsN(data.students.length)}</h2>
          {data.students.length === 0 && (
            <p className="mt-4 rounded-3xl bg-primary-soft p-5 text-muted">
              {trich('class.empty', { code: <b className="text-ink">{data.class.joinCode}</b> })}
            </p>
          )}
          <div className="mt-5 space-y-3">
            {data.students.map((s) => (
              <ListCard
                key={s.id}
                icon={s.name.slice(0, 1).toUpperCase()}
                title={s.name}
                subtitle={s.email ?? tt('class.pinLogin')}
                trailing={
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-medium text-primary">{tt('common.points', { n: s.points })}</span>
                    {!s.email && (
                      <button
                        type="button"
                        onClick={() => resetPin(s)}
                        className="rounded-xl px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft"
                        aria-label={tt('class.newPinAria', { name: s.name })}
                      >
                        {tt('class.newPin')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeStudent(s)}
                      className="rounded-xl px-2 py-1 text-xs font-medium text-danger hover:bg-pink-soft"
                      aria-label={tt('class.removeAria', { name: s.name })}
                    >
                      {tt('class.remove')}
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
