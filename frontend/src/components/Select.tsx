import { useId, type SelectHTMLAttributes } from 'react'

type Props<T extends string | number> = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  error?: string
}

/** Выпадающий список в стиле TextField. */
export function Select<T extends string | number>({ label, value, options, onChange, error, ...rest }: Props<T>) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value)
          if (o) onChange(o.value)
        }}
        className={`w-full appearance-none rounded-2xl border bg-white px-4 py-3.5 text-base outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15 ${
          error ? 'border-danger' : 'border-line'
        }`}
        {...rest}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  )
}
