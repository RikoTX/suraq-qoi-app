import { TOPIC_EMOJI, TOPIC_LABEL, type Kind, type Topic } from '../../api/texts'
import { KIND_LABEL } from '../../api/texts'
import type { Key } from '../../i18n/ru'
import type { TeacherKey } from './i18n/ru'

type T = (key: Key) => string
type TT = (key: TeacherKey) => string

export const topicOptions = (t: T) =>
  (Object.keys(TOPIC_LABEL) as Topic[]).map((x) => ({ value: x, label: `${TOPIC_EMOJI[x]} ${t(`topic.${x}`)}` }))

export const kindOptions = (t: T) => (Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: t(`kind.${k}`) }))

export const difficultyOptions = (tt: TT) =>
  ([1, 2, 3, 4, 5] as const).map((d) => ({ value: d as number, label: `${'★'.repeat(d)}  ${tt(`difficulty.${d}`)}` }))

/** Уровни 1–4 для примеров вопросов к тексту (ключи exampleQuestions). */
export const EXAMPLE_LEVELS = ['1', '2', '3', '4'] as const
