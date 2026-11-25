import { request } from '../auth/api'
import type { Lang } from './classes'

export type Signal = 'stuck' | 'inactive' | 'rising'

export interface OverviewStudent {
  /** id записи students */
  id: string
  name: string
  points: number
  rank: string
  streak: number
  lastActiveDate: string | null
  sessions7: number
  questions7: number
  /** доля вопросов уровней 3–4 за 7 дней, 0–1 */
  depth7: number
  signal: Signal | null
  /** мини-диагностика: верных из 6 */
  diagnosticPre: number | null
  diagnosticPost: number | null
}

export interface DiagnosticStat {
  count: number
  /** средний балл из 6 */
  avg: number
  /** средние по навыкам [найти, связать, оценить], из 2 */
  skills: number[]
}

/** Мини-диагностика класса (ТЗ, 11.1). paired — только ученики, прошедшие обе проверки. */
export interface DiagnosticSummary {
  postOpen: boolean
  postAfterSessions: number
  pre: DiagnosticStat | null
  post: DiagnosticStat | null
  paired: { count: number; preAvg: number; postAvg: number } | null
}

export interface ClassOverview {
  id: string
  name: string
  joinCode: string
  lang: Lang
  /** число оценённых вопросов уровней 0–4 за 7 дней */
  skillMap7: number[]
  avgLevel7: number | null
  activeShare7: number
  depth7: number | null
  depthPrev7: number | null
  diagnostic: DiagnosticSummary
  students: OverviewStudent[]
}

export interface ProfileQuestion {
  id: string
  position: number
  body: string
  levelLocal: number | null
  levelAi: number | null
  levelTeacher: number | null
  aiComment: string | null
  aiHint: string | null
}

export interface ProfileSession {
  id: string
  textTitle: string
  finishedAt: string | null
  points: number
  pending: boolean
  conclusion: string | null
  conclusionScore: number | null
  conclusionComment: string | null
  questions: ProfileQuestion[]
}

export interface StudentProfile {
  id: string
  name: string
  classId: string
  className: string
  points: number
  rank: string
  streak: number
  diagnosticPre: number | null
  diagnosticPost: number | null
  sessions: ProfileSession[]
}

/** Панель учителя: карта навыков класса, профиль ученика, правка оценки ИИ (ТЗ, 7.2). */
export const teacherApi = {
  overview: (token: string, classId: string) => request<ClassOverview>(`/classes/${classId}/overview`, {}, token),
  student: (token: string, studentId: string) => request<StudentProfile>(`/students/${studentId}`, {}, token),
  /** null — вернуть оценку ИИ */
  setLevel: (token: string, questionId: string, levelTeacher: number | null) =>
    request<{ question: ProfileQuestion; sessionPoints: number; studentPoints: number }>(
      `/questions/${questionId}`,
      { method: 'PATCH', body: JSON.stringify({ levelTeacher }) },
      token,
    ),
  /** Открыть итоговую диагностику всему классу, не дожидаясь 10 сессий */
  setPostOpen: (token: string, classId: string, postOpen: boolean) =>
    request<{ postOpen: boolean }>(`/classes/${classId}/diagnostic`, { method: 'PUT', body: JSON.stringify({ postOpen }) }, token),
}

export const SIGNAL_LABEL: Record<Signal, { label: string; emoji: string; hint: string }> = {
  stuck: { label: 'Застрял', emoji: '🧱', hint: '5+ сессий за 2 недели, но ни одного вопроса «вывести» или «оценить»' },
  inactive: { label: 'Пропал', emoji: '💤', hint: 'Нет сессий 7 дней' },
  rising: { label: 'Растёт', emoji: '📈', hint: 'Глубоких вопросов стало на 20+ п.п. больше, чем неделей раньше' },
}
