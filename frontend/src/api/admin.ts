import { request } from '../auth/api'

export interface AdminStats {
  teachers: number
  students: number
  studentsWithoutClass: number
  classes: number
  classTexts: number
  publishedTexts: number
  libraryTexts: number
  sessions: number
  questions: number
  newUsers7Days: number
}

export interface AdminUser {
  id: string
  name: string
  email: string
  role: 'teacher' | 'student'
  createdAt: string
  info: string | null
}

export interface AdminClass {
  id: string
  name: string
  joinCode: string
  lang: 'kk' | 'ru'
  teacherName: string
  students: number
  texts: number
  publishedTexts: number
  createdAt: string
}

/** Админ только наблюдает: сводка, пользователи, классы. */
export const adminApi = {
  stats: (token: string) => request<AdminStats>('/admin/stats', {}, token),
  users: (token: string, role?: 'teacher' | 'student') =>
    request<AdminUser[]>(`/admin/users${role ? `?role=${role}` : ''}`, {}, token),
  classes: (token: string) => request<AdminClass[]>('/admin/classes', {}, token),
}
