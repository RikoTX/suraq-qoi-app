import { lazy, Suspense } from 'react'
import type { Role } from '../auth/api'
import { useAuth } from '../auth/useAuth'
import { Button } from '../components/Button'
import { StudentHomePage } from './student/StudentHomePage'

// Экраны учителя и админа — отдельные чанки: ученику на слабом интернете их качать не нужно (ТЗ, 15).
const TeacherHomePage = lazy(() => import('./teacher/TeacherHomePage').then((m) => ({ default: m.TeacherHomePage })))
const AdminHomePage = lazy(() => import('./admin/AdminHomePage').then((m) => ({ default: m.AdminHomePage })))

const ROLE_LABEL: Record<Role, string> = {
  student: 'Ученик',
  teacher: 'Учитель',
  admin: 'Администратор',
}

/** Главная по роли. Заглушка ниже — на случай неизвестной роли. */
export function HomePage() {
  const { user, signOut } = useAuth()
  if (!user) return null
  if (user.role === 'student') return <StudentHomePage />
  if (user.role === 'teacher') return <Suspense fallback={null}><TeacherHomePage /></Suspense>
  if (user.role === 'admin') return <Suspense fallback={null}><AdminHomePage /></Suspense>

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="px-6 pt-12 pb-8 text-white">
        <p className="text-sm uppercase tracking-wide text-white/70">Сәлем!</p>
        <h1 className="mt-1 text-2xl font-semibold">{user.name}</h1>
      </header>

      <main className="flex-1 rounded-t-[32px] bg-white px-6 pt-8 pb-10">
        <div className="rounded-3xl bg-primary-soft p-5">
          <p className="text-sm text-muted">Вы вошли как</p>
          <p className="mt-1 text-xl font-semibold text-primary">{ROLE_LABEL[user.role]}</p>
          <p className="mt-1 text-sm text-muted">{user.email}</p>
        </div>

        <p className="mt-6 text-muted">Экраны для этой роли появятся на следующих этапах.</p>

        <Button variant="secondary" className="mt-8" onClick={signOut}>
          Выйти
        </Button>
      </main>
    </div>
  )
}
