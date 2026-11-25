import { request } from '../auth/api'

export interface QuestionUpload {
  id: string
  position: number
  body: string
  levelLocal: number
  createdAt: string
}

export interface SessionUpload {
  id: string
  textId: string
  startedAt: string
  finishedAt: string
  conclusion: string | null
  questions: QuestionUpload[]
}

export interface GradedQuestion {
  questionId: string
  level: number
  comment: string | null
  hint: string | null
  byTeacher: boolean
}

export interface SessionResult {
  id: string
  points: number
  conclusionScore: number | null
  conclusionComment: string | null
  /** оценены ещё не все вопросы — очки сессии пока не в счёте */
  pending: boolean
}

export interface StudentProgress {
  points: number
  rank: string
  streak: number
}

export interface UploadResponse {
  graded: GradedQuestion[]
  sessions: SessionResult[]
  student: StudentProgress
  /** сессии, которые сервер не примет никогда — убираем из очереди */
  rejected: string[]
}

/** Отправка сессий. Ученик ждёт не дольше 8 с (ТЗ, 8): дальше — предварительная оценка, сессия остаётся в очереди. */
export const sessionsApi = {
  upload: (token: string, sessions: SessionUpload[], timeoutMs = 8_000) =>
    request<UploadResponse>('/student/sessions', { method: 'POST', body: JSON.stringify({ sessions }) }, token, timeoutMs),
}
