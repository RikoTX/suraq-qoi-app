import { KIND_LABEL, TOPIC_EMOJI, TOPIC_LABEL, type Kind, type Topic } from '../../api/texts'

export const TOPIC_OPTIONS = (Object.keys(TOPIC_LABEL) as Topic[]).map((t) => ({
  value: t,
  label: `${TOPIC_EMOJI[t]} ${TOPIC_LABEL[t]}`,
}))

export const KIND_OPTIONS = (Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))

export const DIFFICULTY_OPTIONS = [1, 2, 3, 4, 5].map((d) => ({
  value: d,
  label: `${'★'.repeat(d)}  ${['очень легко', 'легко', 'средне', 'сложно', 'очень сложно'][d - 1]}`,
}))

export const LEVELS = [
  ['1', 'Найти'],
  ['2', 'Связать'],
  ['3', 'Вывести'],
  ['4', 'Оценить'],
] as const
