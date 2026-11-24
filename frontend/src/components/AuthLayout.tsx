import type { ReactNode } from 'react'
import { Logo } from './Logo'

type Props = {
  title: string
  subtitle: string
  children: ReactNode
}

/** Фиолетовая шапка с логотипом и белый лист снизу — как в Queezy. */
export function AuthLayout({ title, subtitle, children }: Props) {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="relative overflow-hidden px-6 pt-12 pb-10 text-white">
        {/* декоративные круги */}
        <div className="absolute -top-10 -right-12 size-40 rounded-full bg-white/10" />
        <div className="absolute top-16 -right-4 size-16 rounded-full bg-white/10" />

        <div className="relative flex items-center gap-3">
          <Logo size={48} />
          <div>
            <p className="text-lg font-semibold leading-tight">Сұрақ қой</p>
            <p className="text-sm text-white/70">Обыграй ИИ</p>
          </div>
        </div>

        <h1 className="relative mt-8 text-2xl font-semibold">{title}</h1>
        <p className="relative mt-1 text-white/80">{subtitle}</p>
      </header>

      <main className="flex-1 rounded-t-[32px] bg-white px-6 pt-8 pb-10">{children}</main>
    </div>
  )
}
