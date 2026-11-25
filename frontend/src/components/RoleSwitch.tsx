import type { Role } from '../auth/api'
import { useI18n } from '../i18n/useI18n'
import type { Key } from '../i18n/ru'

type SelfRole = Exclude<Role, 'admin'>

const OPTIONS: { value: SelfRole; label: Key; emoji: string }[] = [
  { value: 'student', label: 'login.student', emoji: '🎒' },
  { value: 'teacher', label: 'login.teacher', emoji: '📚' },
]

type Props = {
  value: SelfRole
  onChange: (role: SelfRole) => void
}

/** Выбор «ученик / учитель» на экране входа. Роль «админ» через форму не выдаётся. */
export function RoleSwitch({ value, onChange }: Props) {
  const { t } = useI18n()
  return (
    <div role="radiogroup" aria-label={t('login.role')} className="grid grid-cols-2 gap-3">
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
            <span className={`mt-2 block font-medium ${active ? 'text-primary' : ''}`}>{t(o.label)}</span>
          </button>
        )
      })}
    </div>
  )
}
