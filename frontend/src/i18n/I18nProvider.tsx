import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { I18nContext, type I18n } from './useI18n'
import { LOCALE, rich, saveLang, storedLang, translate, translateError, langChosen, type UiLang } from './translate'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLang>(() => {
    const l = storedLang()
    document.documentElement.lang = l
    return l
  })

  const setLang = useCallback((next: UiLang, explicit = true) => {
    if (!explicit && langChosen()) return
    saveLang(next, explicit)
    setLangState(next)
  }, [])

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, params) => translate(lang, key, params),
      rich: (key, params) => rich(lang, key, params),
      err: (message) => translateError(lang, message),
      locale: LOCALE[lang],
    }),
    [lang, setLang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
