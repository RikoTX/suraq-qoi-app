import type { Role } from '../auth/api'
import { useAuth } from '../auth/useAuth'
import { Button } from '../components/Button'

const ROLE_LABEL: Record<Role, string> = {
  student: 'Ученик',
  teacher: 'Учитель',
  admin: 'Администратор',
}

/** Временная главная: показывает, кто вошёл. Экраны по ролям — следующие этапы. */
export function HomePage() {
  const { user, signOut } = useAuth()
  if (!user) return null

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
