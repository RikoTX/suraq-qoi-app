/**
 * Предварительная оценка вопроса правилами — когда ответа ИИ нет (ТЗ, 9.3).
 * Копия backend/Services/Grading/HeuristicGrader.cs: меняете здесь — меняйте и там.
 * Не выше уровня 2: уровни 3–4 ставит только ИИ или учитель.
 */
export const MAX_LOCAL_LEVEL = 2
const MIN_WORDS = 4
const STEM_LENGTH = 5

// Маркеры: слова через пробел; «*» в конце — сравнение по началу слова, без «*» — слово целиком.
const LEVEL2 = [
  // ru
  'почему', 'зачем', 'отчего', 'чем отлича*', 'как связ*', 'что будет', 'если', 'как дума*', 'что было бы',
  'можно ли довер*', 'прав* ли', 'докаж*', 'достоверн*', 'убедительн*',
  // kk
  'неліктен', 'неге', 'не үшін', 'айырмашылығы', 'айырмашылық*', 'егер', 'қалай ойлайс*', 'не болар еді',
  'сенуге бола ма', 'дұрыс па', 'дәлелде*', 'сенімді*',
].map((m) => m.split(' ').filter(Boolean))

/** Нижний регистр, только буквы и цифры, ё → е. */
export function words(s: string): string[] {
  let out = ''
  for (const ch of s.toLowerCase()) out += /[\p{L}\p{Nd}]/u.test(ch) ? (ch === 'ё' ? 'е' : ch) : ' '
  return out.split(' ').filter(Boolean)
}

const stem = (w: string) => (w.length > STEM_LENGTH ? w.slice(0, STEM_LENGTH) : w)

/** Сколько разных «основ» (первые 5 букв слов длиной ≥ 4) есть в тексте. */
export function overlap(ws: string[], text: string): number {
  const textStems = new Set(words(text).filter((w) => w.length >= 4).map(stem))
  const own = new Set(ws.filter((w) => w.length >= 4).map(stem))
  let n = 0
  for (const s of own) if (textStems.has(s)) n++
  return n
}

function matches(word: string, pattern: string) {
  return pattern.endsWith('*') ? word.startsWith(pattern.slice(0, -1)) : word === pattern
}

function contains(ws: string[], marker: string[]) {
  for (let i = 0; i + marker.length <= ws.length; i++) {
    if (marker.every((p, j) => matches(ws[i + j], p))) return true
  }
  return false
}

/** Уровень вопроса 0–2. previous — предыдущие вопросы этой же сессии. */
export function localLevel(question: string, text: string, previous: string[]): number {
  const ws = words(question)
  if (ws.length < MIN_WORDS) return 0
  const norm = ws.join(' ')
  if (previous.some((p) => words(p).join(' ') === norm)) return 0

  const o = overlap(ws, text)
  if (o === 0) return 0
  // Маркер уровня 2 засчитывается, только если вопрос опирается на текст (≥ 2 слова из него).
  if (LEVEL2.some((m) => contains(ws, m))) return o >= 2 ? 2 : 1
  return 1
}

/** Предварительная оценка вывода 0–10 (ИИ ставит до 20). */
export function localConclusionScore(conclusion: string, text: string): number {
  const ws = words(conclusion)
  const o = overlap(ws, text)
  if (ws.length >= 15 && o >= 3) return 10
  if (ws.length >= 6 && o >= 1) return 5
  return 0
}
