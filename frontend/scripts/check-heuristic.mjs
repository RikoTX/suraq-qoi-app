// Проверяет, что scoring/heuristic.ts даёт те же уровни, что HeuristicGrader на бэкенде (ТЗ, 9.3).
// Примеры — общие: backend/tests/heuristic-cases.json. Запуск: npm run test:heuristic
import { readFileSync } from 'node:fs'
import { localLevel } from '../src/scoring/heuristic.ts'

const { texts, cases } = JSON.parse(readFileSync(new URL('../../backend/tests/heuristic-cases.json', import.meta.url), 'utf8'))
let failed = 0
for (const c of cases) {
  const got = localLevel(c.q, texts[c.text], c.previous ?? [])
  if (got !== c.level) {
    failed++
    console.error(`✗ «${c.q}»: ожидали ${c.level}, получили ${got} — ${c.why}`)
  }
}
console.log(failed ? `${failed} из ${cases.length} не совпали` : `✓ ${cases.length} примеров совпадают с бэкендом`)
process.exit(failed ? 1 : 0)
