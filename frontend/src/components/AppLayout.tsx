import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { Logo } from './Logo'

type Props = {
  /** Мелкая строка над заголовком, например «Сәлем!» */
  eyebrow?: string
  title: string
  /** Ссылка «назад» в шапке */
  back?: string
  /** Дополнительный блок в шапке (карточка, код класса) */
  header?: ReactNode
  children: ReactNode
}

/** Экран после входа в стиле Queezy: фиолетовая шапка + белый лист. */
export function AppLayout({ eyebrow, title, back, header, children }: Props) {
  const { user, signOut } = useAuth()
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="relative overflow-hidden px-6 pt-10 pb-8 text-white">
        <div className="absolute -top-10 -right-12 size-40 rounded-full bg-white/10" />
        <div className="absolute top-20 -right-4 size-16 rounded-full bg-white/10" />

        <div className="relative flex items-center justify-between">
          {back ? (
            <Link to={back} className="flex size-10 items-center justify-center rounded-2xl bg-white/15 text-xl" aria-label="Назад">
              ←
            </Link>
          ) : (
            <Logo size={40} />
          )}
          {/* Ученик не «выходит», а уступает телефон: его данные остаются на устройстве (ТЗ, 7.0.2). */}
          <button onClick={signOut} className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25">
            {user?.role === 'student' ? 'Сменить ученика' : 'Выйти'}
          </button>
        </div>

        {eyebrow && <p className="relative mt-6 text-sm uppercase tracking-wide text-white/70">{eyebrow}</p>}
        <h1 className={`relative text-2xl font-semibold ${eyebrow ? 'mt-1' : 'mt-6'}`}>{title}</h1>
        {header && <div className="relative mt-6">{header}</div>}
      </header>

      <main className="flex-1 rounded-t-[32px] bg-white px-6 pt-8 pb-10">{children}</main>
    </div>
  )
}
