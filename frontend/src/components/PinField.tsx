import { TextField } from './TextField'

type Props = {
  label?: string
  value: string
  onChange: (pin: string) => void
  error?: string
  autoFocus?: boolean
}

/** PIN ученика: 4 цифры, цифровая клавиатура на телефоне. */
export function PinField({ label = 'PIN', value, onChange, error, autoFocus }: Props) {
  return (
    <TextField
      label={label}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      placeholder="••••"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
      error={error}
      autoFocus={autoFocus}
    />
  )
}
