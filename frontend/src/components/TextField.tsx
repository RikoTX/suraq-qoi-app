import { useId, type InputHTMLAttributes } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
}

export function TextField({ label, error, ...input }: Props) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full rounded-2xl border bg-white px-4 py-3.5 text-base outline-none transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/15 ${
          error ? 'border-danger' : 'border-line'
        }`}
        {...input}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
