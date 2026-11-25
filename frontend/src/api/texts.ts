import { request } from '../auth/api'
import type { Lang } from './classes'

export type Topic = 'sport' | 'games' | 'money' | 'nature' | 'history' | 'tech' | 'local'
export type Kind = 'article' | 'table' | 'notice' | 'schedule' | 'social_post' | 'math_problem'

export interface ReadingText {
  id: string
  /** null — общая библиотека */
  classId: string | null
  lang: Lang
  topic: Topic
  kind: Kind
  difficulty: number
  title: string
  /** markdown */
  body: string
  /** уровень "1"–"4" → пример вопроса */
  exampleQuestions: Record<string, string>
  hints: string[]
  reviewed: boolean
  updatedAt: string
}

export interface Pack {
  /** версия пакета — передаётся как since при следующем обновлении */
  version: string | null
  /** новые и изменённые тексты */
  texts: ReadingText[]
  /** id всех опубликованных текстов: остальные удаляем с устройства */
  ids: string[]
}

export type TextUpdate = Pick<
  ReadingText,
  'title' | 'body' | 'topic' | 'kind' | 'difficulty' | 'exampleQuestions' | 'hints' | 'reviewed'
>

/** Учитель: тексты своего класса и общая библиотека. */
export const teacherTextsApi = {
  classTexts: (token: string, classId: string) => request<ReadingText[]>(`/classes/${classId}/texts`, {}, token),
  create: (token: string, classId: string, data: TextUpdate) =>
    request<ReadingText>(`/classes/${classId}/texts`, { method: 'POST', body: JSON.stringify(data) }, token),
  /** ИИ пишет черновики; может занять до минуты. */
  generate: (token: string, classId: string, data: GenerateRequest) =>
    request<ReadingText[]>(`/classes/${classId}/texts/generate`, { method: 'POST', body: JSON.stringify(data) }, token, 120_000),
  fromLibrary: (token: string, classId: string, textIds: string[]) =>
    request<ReadingText[]>(`/classes/${classId}/texts/from-library`, { method: 'POST', body: JSON.stringify({ textIds }) }, token),
  library: (token: string, lang: Lang) => request<ReadingText[]>(`/library?lang=${lang}`, {}, token),
  get: (token: string, id: string) => request<ReadingText>(`/texts/${id}`, {}, token),
  update: (token: string, id: string, data: TextUpdate) =>
    request<ReadingText>(`/texts/${id}`, { method: 'PUT', body: JSON.stringify(data) }, token),
  remove: (token: string, id: string) => request<void>(`/texts/${id}`, { method: 'DELETE' }, token),
}

export interface GenerateRequest {
  topic: Topic
  kind: Kind
  difficulty: number
  count: number
}

/** Ученик: пакет текстов. Таймаут 8 с (ТЗ, 5.1) — при слабой связи работаем с тем, что уже на устройстве. */
export const packApi = {
  get: (token: string, since: string | null) =>
    request<Pack>(`/student/pack${since ? `?since=${encodeURIComponent(since)}` : ''}`, {}, token, 8_000),
}

export const TOPIC_LABEL: Record<Topic, string> = {
  sport: 'Спорт',
  games: 'Игры',
  money: 'Деньги',
  nature: 'Природа',
  history: 'История',
  tech: 'Технологии',
  local: 'Наш город',
}

export const KIND_LABEL: Record<Kind, string> = {
  article: 'Статья',
  table: 'Таблица',
  notice: 'Объявление',
  schedule: 'Расписание',
  social_post: 'Пост',
  math_problem: 'Задача',
}

export const TOPIC_EMOJI: Record<Topic, string> = {
  sport: '🏐',
  games: '🎮',
  money: '💰',
  nature: '🌿',
  history: '🏛️',
  tech: '💡',
  local: '🏘️',
}
