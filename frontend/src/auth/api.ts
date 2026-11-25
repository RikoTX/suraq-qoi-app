export type Role = 'student' | 'teacher' | 'admin'

export interface User {
  id: string
  name: string
  /** null у ученика: он входит по коду класса + имени + PIN */
  email: string | null
  role: Role
}

export interface AuthResponse {
  token: string
  user: User
}

/** Ошибка API: общее сообщение + ошибки по полям формы (из ValidationProblemDetails). */
export class ApiError extends Error {
  readonly status: number
  readonly fields: Record<string, string>

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }

  /** Сервер недоступен: нет сети, таймаут или прокси не достучался до API (502–504). */
  get offline() {
    return this.status === 0 || (this.status >= 502 && this.status <= 504)
  }
}

export async function request<T>(path: string, init: RequestInit = {}, token?: string, timeoutMs = 15_000): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new ApiError(0, 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.')
  }

  if (res.status === 204) return undefined as T
  if (res.ok) return (await res.json()) as T

  const body = await res.json().catch(() => null)
  const fields: Record<string, string> = {}
  for (const [key, messages] of Object.entries<string[]>(body?.errors ?? {})) {
    fields[key] = messages[0]
  }
  throw new ApiError(res.status, body?.title ?? 'Что-то пошло не так', fields)
}

export const authApi = {
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  /** Регистрация учителя. Ученики регистрируются по коду класса (studentAuthApi). */
  register: (data: { name: string; email: string; password: string }) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify({ ...data, role: 'teacher' }) }),

  me: (token: string) => request<User>('/auth/me', {}, token),
}

export interface Classmate {
  /** id пользователя */
  id: string
  name: string
}

export interface ClassLookup {
  className: string
  lang: 'kk' | 'ru'
  students: Classmate[]
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

/** Вход ученика без email: код класса → своё имя → PIN из 4 цифр (ТЗ, 7.0.1). */
export const studentAuthApi = {
  lookupClass: (joinCode: string) => request<ClassLookup>('/auth/student/class', post({ joinCode })),
  register: (joinCode: string, name: string, pin: string) =>
    request<AuthResponse>('/auth/student/register', post({ joinCode, name, pin })),
  login: (joinCode: string, studentId: string, pin: string) =>
    request<AuthResponse>('/auth/student/login', post({ joinCode, studentId, pin })),
}
