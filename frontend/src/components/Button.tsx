import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
  variant?: 'primary' | 'secondary'
}

export function Button({ loading, variant = 'primary', children, disabled, className = '', ...rest }: Props) {
  const styles =
    variant === 'primary'
      ? 'bg-primary text-white hover:bg-primary-dark'
      : 'bg-primary-soft text-primary hover:bg-primary/15'

  return (
    <button
      disabled={disabled || loading}
      className={`w-full rounded-2xl px-6 py-4 text-base font-medium transition disabled:opacity-60 ${styles} ${className}`}
      {...rest}
    >
      {loading ? 'Подождите…' : children}
    </button>
  )
}
