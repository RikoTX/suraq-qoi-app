/** 1 ученик, 2 ученика, 5 учеников. */
export function pluralStudents(n: number) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'ученик'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'ученика'
  return 'учеников'
}
