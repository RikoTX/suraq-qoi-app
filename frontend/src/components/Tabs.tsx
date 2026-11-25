type Props<T extends string> = {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

/** Переключатель-«пилюли» как вкладки в Queezy. */
export function Tabs<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-2xl bg-white p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              o.value === value ? 'bg-primary text-white' : 'text-muted hover:text-primary'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
