import { request } from '../auth/api'

export type Lang = 'kk' | 'ru'

export interface SchoolClass {
  id: string
  name: string
  joinCode: string
  lang: Lang
  studentCount: number
  createdAt: string
}

export interface ClassStudent {
  id: string
  name: string
  email: string
  points: number
  streak: number
  lastActiveDate: string | null
}

export interface StudentClass {
  id: string
  name: string
  lang: Lang
  teacherName: string
}

export interface StudentMe {
  name: string
  points: number
  streak: number
  class: StudentClass | null
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

/** Учитель: классы и ученики. */
export const classesApi = {
  list: (token: string) => request<SchoolClass[]>('/classes', {}, token),
  create: (token: string, data: { name: string; lang: Lang }) => request<SchoolClass>('/classes', post(data), token),
  students: (token: string, id: string) =>
    request<{ class: SchoolClass; students: ClassStudent[] }>(`/classes/${id}/students`, {}, token),
  /** Убрать ученика из класса. Аккаунт остаётся — он сможет вступить по коду в нужный класс. */
  removeStudent: (token: string, classId: string, studentId: string) =>
    request<void>(`/classes/${classId}/students/${studentId}`, { method: 'DELETE' }, token),
}

/** Ученик: профиль и вступление в класс. */
export const studentApi = {
  me: (token: string) => request<StudentMe>('/student/me', {}, token),
  joinClass: (token: string, joinCode: string) => request<StudentClass>('/student/join-class', post({ joinCode }), token),
}

export const LANG_LABEL: Record<Lang, string> = { kk: 'Қазақша', ru: 'Русский' }
