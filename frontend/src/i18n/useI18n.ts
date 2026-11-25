import { createContext, useContext, type ReactNode } from 'react'
import type { Key } from './ru'
import type { Params, UiLang } from './translate'

export interface I18n {
  lang: UiLang
  /** explicit — ученик сам выбрал язык (иначе — подстройка под язык класса) */
  setLang: (lang: UiLang, explicit?: boolean) => void
  t: (key: Key, params?: Params) => string
  rich: (key: Key, params: Record<string, ReactNode>) => ReactNode
  /** Сообщение ошибки (сервер отвечает на русском) на языке интерфейса */
  err: (message: string) => string
  /** для toLocaleDateString */
  locale: string
}

export const I18nContext = createContext<I18n | null>(null)

/** Язык интерфейса ученика: ru или kk. Работает внутри <I18nProvider>. */
export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
