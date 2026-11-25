import { createElement, Fragment, type ReactNode } from 'react'
import { kk, lockedPinKk, serverErrorsKk } from './kk'
import { ru, type Key } from './ru'

export type UiLang = 'ru' | 'kk'
export type Params = Record<string, string | number>

const LANG_KEY = 'uiLang'
const CHOSEN_KEY = 'uiLangChosen'
const dict: Record<UiLang, Record<Key, string>> = { ru, kk }

/** Язык интерфейса на устройстве: выбранный раньше, иначе — язык браузера. */
export function storedLang(): UiLang {
  const saved = localStorage.getItem(LANG_KEY)
  if (saved === 'kk' || saved === 'ru') return saved
  return navigator.language.toLowerCase().startsWith('kk') ? 'kk' : 'ru'
}

/** Ученик сам переключал язык — тогда язык класса его не меняет. */
export const langChosen = () => localStorage.getItem(CHOSEN_KEY) === '1'

export function saveLang(lang: UiLang, explicit: boolean) {
  localStorage.setItem(LANG_KEY, lang)
  if (explicit) localStorage.setItem(CHOSEN_KEY, '1')
  document.documentElement.lang = lang
}

export function translate(lang: UiLang, key: Key, params?: Params): string {
  const template = dict[lang][key] ?? ru[key]
  return params ? template.replace(/\{(\w+)\}/g, (m, p: string) => (p in params ? String(params[p]) : m)) : template
}

/** Строка с разметкой внутри: «Класс {name}» → «Класс <b>8А</b>» на любом языке и в любом порядке слов. */
export function rich(lang: UiLang, key: Key, params: Record<string, ReactNode>): ReactNode {
  const parts = dict[lang][key].split(/\{(\w+)\}/)
  return createElement(Fragment, null, ...parts.map((part, i) => (i % 2 === 1 ? (params[part] ?? `{${part}}`) : part)))
}

/** Сообщение сервера или клиента на русском → язык интерфейса. */
export function translateError(lang: UiLang, message: string): string {
  if (lang === 'ru') return message
  if (message === ru['common.offline']) return kk['common.offline']
  if (message === ru['common.error']) return kk['common.error']
  return serverErrorsKk[message] ?? lockedPinKk(message) ?? message
}

export const LOCALE: Record<UiLang, string> = { ru: 'ru-RU', kk: 'kk-KZ' }
