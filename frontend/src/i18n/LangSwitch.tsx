import { useI18n } from './useI18n'
import type { UiLang } from './translate'

const OPTIONS: { value: UiLang; label: string }[] = [
  { value: 'kk', label: 'ҚАЗ' },
  { value: 'ru', label: 'РУС' },
]

/** Переключатель языка интерфейса в фиолетовой шапке. */
export function LangSwitch() {
  const { lang, setLang, t } = useI18n()
  return (
    <div role="radiogroup" aria-label={t('lang.label')} className="flex rounded-2xl bg-white/15 p-1 text-xs font-semibold">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={lang === o.value}
          onClick={() => setLang(o.value)}
          className={`rounded-xl px-2.5 py-1.5 transition ${lang === o.value ? 'bg-white text-primary' : 'text-white/80 hover:text-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
