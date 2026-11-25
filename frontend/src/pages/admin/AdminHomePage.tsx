import { useEffect, useState } from 'react'
import { adminApi, type AdminClass, type AdminStats, type AdminUser } from '../../api/admin'
import { LANG_LABEL } from '../../api/classes'
import { ApiError } from '../../auth/api'
import { useAuth } from '../../auth/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { ListCard } from '../../components/ListCard'
import { Tabs } from '../../components/Tabs'

type Tab = 'teachers' | 'students' | 'classes'

/** Админ наблюдает за проектом: кто зарегистрирован, классы, общая статистика. */
export function AdminHomePage() {
  const { token } = useAuth()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [tab, setTab] = useState<Tab>('teachers')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [classes, setClasses] = useState<AdminClass[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить данные')
    adminApi.stats(token).then(setStats).catch(fail)
    adminApi.users(token).then(setUsers).catch(fail)
    adminApi.classes(token).then(setClasses).catch(fail)
  }, [token])

  const shown = users?.filter((u) => u.role === (tab === 'teachers' ? 'teacher' : 'student')) ?? []

  return (
    <AppLayout
      eyebrow="Администратор"
      title="Обзор проекта"
      header={
        stats && (
          <div className="grid grid-cols-3 gap-2 text-ink">
            <Stat value={stats.teachers} label="учителей" />
            <Stat value={stats.students} label="учеников" />
            <Stat value={stats.classes} label="классов" />
          </div>
        )
      }
    >
      {error && <p className="mb-6 rounded-2xl bg-pink-soft px-4 py-3 text-sm">{error}</p>}

      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <Fact label="Опубликовано текстов" value={`${stats.publishedTexts} из ${stats.classTexts}`} />
          <Fact label="В библиотеке" value={stats.libraryTexts} />
          <Fact label="Сессий чтения" value={stats.sessions} />
          <Fact label="Вопросов учеников" value={stats.questions} />
          <Fact label="Новых за 7 дней" value={stats.newUsers7Days} />
          <Fact label="Учеников без класса" value={stats.studentsWithoutClass} />
        </div>
      )}

      <div className="mt-8">
        <Tabs
          label="Список"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'teachers', label: 'Учителя' },
            { value: 'students', label: 'Ученики' },
            { value: 'classes', label: 'Классы' },
          ]}
        />
      </div>

      <div className="mt-5 space-y-3">
        {tab !== 'classes' && !users && !error && <p className="text-muted">Загрузка…</p>}
        {tab !== 'classes' && users && shown.length === 0 && <p className="text-muted">Пока никого.</p>}
        {tab !== 'classes' &&
          shown.map((u) => (
            <ListCard
              key={u.id}
              icon={u.name.slice(0, 1).toUpperCase()}
              title={u.name}
              subtitle={`${u.email} · ${u.info ?? ''}`}
              trailing={<span className="shrink-0 text-xs text-muted">{new Date(u.createdAt).toLocaleDateString('ru-RU')}</span>}
            />
          ))}

        {tab === 'classes' && !classes && !error && <p className="text-muted">Загрузка…</p>}
        {tab === 'classes' && classes?.length === 0 && <p className="text-muted">Классов пока нет.</p>}
        {tab === 'classes' &&
          classes?.map((c) => (
            <ListCard
              key={c.id}
              icon={c.name.slice(0, 3)}
              title={`${c.name} · ${LANG_LABEL[c.lang]} · ${c.joinCode}`}
              subtitle={`${c.teacherName} · учеников ${c.students} · текстов ${c.publishedTexts}/${c.texts}`}
            />
          ))}
      </div>
    </AppLayout>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 text-center">
      <p className="text-2xl font-semibold text-primary">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-3xl bg-primary-soft p-4">
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  )
}
