import type { LocalQuestion, LocalSession } from '../offline/db'

/**
 * Очки и ранги (ТЗ, раздел 10). Копия backend/Services/Scoring/PointsCalculator.cs.
 * Источник истины — сервер; здесь — чтобы показать очки до синхронизации.
 */
export const LEVEL_POINTS = [0, 10, 20, 30, 50]

export type RankCode = 'novice' | 'sleuth' | 'detective' | 'professor' | 'master'

export const RANKS: { code: RankCode; from: number; label: string; emoji: string }[] = [
  { code: 'novice', from: 0, label: 'Новичок', emoji: '🌱' },
  { code: 'sleuth', from: 200, label: 'Сыщик', emoji: '🔍' },
  { code: 'detective', from: 600, label: 'Детектив', emoji: '🕵️' },
  { code: 'professor', from: 1500, label: 'Профессор', emoji: '🎓' },
  { code: 'master', from: 3000, label: 'Мастер вопросов', emoji: '🏆' },
]

export const LEVELS: { code: string; label: string; short: string }[] = [
  { code: 'off_text', label: 'Не по тексту', short: 'мимо' },
  { code: 'locate', label: 'Найти', short: 'найти' },
  { code: 'connect', label: 'Связать', short: 'связать' },
  { code: 'infer', label: 'Вывести', short: 'вывести' },
  { code: 'evaluate', label: 'Оценить', short: 'оценить' },
]

/** Итоговый уровень: учитель важнее ИИ. null — ещё не проверен. */
export const finalLevel = (q: LocalQuestion) => q.levelTeacher ?? q.levelAi

/** Уровень для показа: проверенный или предварительный (правила). */
export const shownLevel = (q: LocalQuestion) => finalLevel(q) ?? q.levelLocal

export function isPending(s: LocalSession, qs: LocalQuestion[]) {
  return qs.some((q) => finalLevel(q) === null) || (!!s.conclusion?.trim() && s.conclusionScore === null)
}

/** Очки сессии: проверенные — по оценке ИИ/учителя, иначе — предварительные по правилам. */
export function sessionPoints(s: LocalSession, qs: LocalQuestion[]) {
  const q = qs.reduce((sum, x) => sum + LEVEL_POINTS[shownLevel(x)], 0)
  return q + (s.conclusionScore ?? s.conclusionScoreLocal)
}

export function rankOf(points: number) {
  return [...RANKS].reverse().find((r) => points >= r.from) ?? RANKS[0]
}

export function nextRank(points: number) {
  return RANKS.find((r) => r.from > points) ?? null
}
