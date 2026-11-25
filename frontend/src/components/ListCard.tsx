import type { ReactNode } from 'react'
import { Link } from 'react-router'

type Props = {
  icon: ReactNode
  title: string
  subtitle: string
  to?: string
  trailing?: ReactNode
}

/** Строка-карточка как в списках Queezy: цветная плитка, заголовок, подпись, стрелка. */
export function ListCard({ icon, title, subtitle, to, trailing }: Props) {
  const body = (
    <>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-pink-soft text-lg font-semibold text-ink">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-sm text-muted">{subtitle}</span>
      </span>
      {trailing ?? (to && <span className="text-xl text-primary" aria-hidden>›</span>)}
    </>
  )
  const cls = 'flex items-center gap-4 rounded-3xl border-2 border-line bg-white p-3 pr-5'
  return to ? (
    <Link to={to} className={`${cls} transition hover:border-primary/40`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
