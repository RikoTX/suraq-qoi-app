import { useMemo, type ReactNode } from 'react'
import { format, formatRich, type Params } from '../../i18n/translate'
import { useI18n } from '../../i18n/useI18n'
import { teacherErrorsKk, teacherKk, teacherPatternKk } from './i18n/kk'
import { teacherRu, type TeacherKey } from './i18n/ru'
import { pluralStudents } from './plural'

/**
 * Язык экранов учителя: tt — строки учителя (свой словарь в чанке учителя), t — общие (уровни, темы, навыки).
 * err переводит и сообщения сервера для учителя.
 */
export function useTeacherI18n() {
  const base = useI18n()
  return useMemo(() => {
    const kk = base.lang === 'kk'
    const dict = kk ? teacherKk : teacherRu
    return {
      ...base,
      tt: (key: TeacherKey, params?: Params) => format(dict[key], params),
      trich: (key: TeacherKey, params: Record<string, ReactNode>) => formatRich(dict[key], params),
      err: (message: string) => (kk ? (teacherErrorsKk[message] ?? teacherPatternKk(message) ?? base.err(message)) : message),
      /** «5 учеников» / «5 оқушы» */
      students: (n: number) => (kk ? `${n} оқушы` : `${n} ${pluralStudents(n)}`),
    }
  }, [base])
}
