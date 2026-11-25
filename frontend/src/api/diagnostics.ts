import { request } from '../auth/api'
import type { Lang } from './classes'

export type DiagnosticKind = 'pre' | 'post'
export type Skill = 'locate' | 'connect' | 'evaluate'

export interface DiagnosticTask {
  skill: Skill
  q: string
  options: string[]
  /** индекс верного варианта — проверка на устройстве, без сети */
  answer: number
}

export interface DiagnosticText {
  title: string
  body: string
  tasks: DiagnosticTask[]
}

export interface DiagnosticForm {
  kind: DiagnosticKind
  form: 'A' | 'B'
  lang: Lang
  texts: DiagnosticText[]
}

export interface DiagnosticResult {
  id: string
  kind: DiagnosticKind
  form: 'A' | 'B'
  /** верных из 6 */
  score: number
  /** верных по навыкам [найти, связать, оценить], из 2 */
  skills: number[]
  takenAt: string
}

export interface DiagnosticStatus {
  pre: DiagnosticResult | null
  post: DiagnosticResult | null
  /** сессий ученика на сервере */
  sessions: number
  postAfterSessions: number
  /** учитель открыл итоговую классу */
  postOpen: boolean
  /** задания, которые ученику ещё предстоят */
  forms: DiagnosticForm[]
}

export interface DiagnosticUpload {
  id: string
  kind: DiagnosticKind
  form: 'A' | 'B'
  lang: Lang
  answers: number[]
  startedAt: string
  finishedAt: string
}

export const SKILLS: Skill[] = ['locate', 'connect', 'evaluate']


/** Мини-диагностика (ТЗ, 11.1). */
export const diagnosticsApi = {
  status: (token: string) => request<DiagnosticStatus>('/student/diagnostic', {}, token, 8_000),
  submit: (token: string, d: DiagnosticUpload) =>
    request<DiagnosticResult>('/student/diagnostics', { method: 'POST', body: JSON.stringify(d) }, token, 8_000),
}
