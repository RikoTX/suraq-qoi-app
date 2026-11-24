import type { Role } from '../auth/api'

type SelfRole = Exclude<Role, 'admin'>

const OPTIONS: { value: SelfRole; label: string; emoji: string }[] = [
  { value: 'student', label: 'Я ученик', emoji: '🎒' },
  { value: 'teacher', label: 'Я учитель', emoji: '📚' },
]

type Props = {
  value: SelfRole
  onChange: (role: SelfRole) => void
}

/** Выбор роли при регистрации. Роль «админ» через форму не выдаётся. */
export function RoleSwitch({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Роль" className="grid grid-cols-2 gap-3">
      {OPTIONS.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-2xl border-2 px-4 py-4 text-left transition ${
              active ? 'border-primary bg-primary-soft' : 'border-line bg-white hover:border-primary/40'
            }`}
          >
            <span className="block text-2xl" aria-hidden>
              {o.emoji}
            </span>
            <span className={`mt-2 block font-medium ${active ? 'text-primary' : ''}`}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
