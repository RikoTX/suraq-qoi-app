import { useId, type TextareaHTMLAttributes } from 'react'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  error?: string
}

/** Многострочное поле в стиле TextField. */
export function TextArea({ label, error, className = '', ...input }: Props) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        rows={3}
        {...input}
        className={`w-full resize-none rounded-2xl border bg-white px-4 py-3.5 text-base outline-none transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/15 ${
          error ? 'border-danger' : 'border-line'
        } ${className}`}
      />
      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  )
}
