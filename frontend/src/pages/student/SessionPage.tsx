import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { Button } from '../../components/Button'
import { Markdown } from '../../components/Markdown'
import { TextArea } from '../../components/TextArea'
import { db, type LocalQuestion, type LocalSession } from '../../offline/db'
import { flushOutbox, saveSession } from '../../offline/outbox'
import { localConclusionScore, localLevel } from '../../scoring/heuristic'

const QUESTIONS = 3
const MAX_QUESTION = 500
const MAX_CONCLUSION = 1000

const LADDER = [
  { label: 'Найти', points: 10, example: 'Когда? Где? Сколько?' },
  { label: 'Связать', points: 20, example: 'Почему? Чем отличается?' },
  { label: 'Вывести', points: 30, example: 'Что будет, если…? Успеет ли…?' },
  { label: 'Оценить', points: 50, example: 'Можно ли доверять…? Убедительно ли…?' },
]

/**
 * Сессия «Обыграй ИИ» (ТЗ, S3): 3 вопроса к тексту → вывод → итог.
 * Работает без сети: сессия пишется на устройство и в очередь, оценка ИИ придёт, когда появится связь.
 */
export function SessionPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const text = useLiveQuery(async () => (id ? ((await db.texts.get(id)) ?? null) : null), [id])
  // Время начала — момент открытия экрана (ленивая инициализация, без вызова Date в каждом рендере).
  const [startedAt] = useState(() => new Date().toISOString())
  const [questions, setQuestions] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [conclusion, setConclusion] = useState('')
  const [showText, setShowText] = useState(false)
  const [hint, setHint] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (text === undefined || !user) return null
  if (text === null) {
    return (
      <AppLayout back="/" title="Текст не найден">
        <p className="text-muted">Этого текста нет на устройстве. Вернитесь к списку и обновите его.</p>
      </AppLayout>
    )
  }

  const step = questions.length // 0..2 — вопросы, 3 — вывод
  const asking = step < QUESTIONS

  function addQuestion() {
    const q = draft.trim()
    if (q.split(/\s+/).length < 3) return setError('Напиши вопрос полностью — хотя бы три слова.')
    if (questions.some((x) => x.trim().toLowerCase() === q.toLowerCase())) return setError('Такой вопрос уже был. Придумай другой.')
    setError(null)
    setQuestions([...questions, q])
    setDraft('')
    setShowText(false)
  }

  async function finish() {
    if (!text || !user) return
    setSaving(true)
    const now = new Date().toISOString()
    const sessionId = crypto.randomUUID()
    const previous: string[] = []
    const localQuestions: LocalQuestion[] = questions.map((body, i) => {
      const levelLocal = localLevel(body, text.body, previous)
      previous.push(body)
      return {
        id: crypto.randomUUID(), sessionId, position: i + 1, body, levelLocal,
        levelAi: null, levelTeacher: null, comment: null, hint: null, createdAt: now,
      }
    })
    const c = conclusion.trim() || null
    const session: LocalSession = {
      id: sessionId, userId: user.id, textId: text.id, textTitle: text.title,
      startedAt, finishedAt: now, conclusion: c,
      conclusionScoreLocal: c ? localConclusionScore(c, text.body) : 0,
      conclusionScore: null, conclusionComment: null, points: null,
    }
    await saveSession(session, localQuestions)
    // Ждём ответ не дольше 8 с; не дождались — на итоге будет предварительная оценка.
    await flushOutbox(true).catch(() => {})
    navigate(`/results/${sessionId}`, { replace: true })
  }

  return (
    <AppLayout
      back={`/texts/${text.id}`}
      title={text.title}
      header={
        <div className="flex gap-2" aria-label={`Шаг ${step + 1} из ${QUESTIONS + 1}`}>
          {Array.from({ length: QUESTIONS + 1 }, (_, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full ${i <= step ? 'bg-white' : 'bg-white/25'}`} />
          ))}
        </div>
      }
    >
      {asking ? (
        <div className="space-y-5">
          <div>
            <p className="text-sm text-muted">Вопрос {step + 1} из {QUESTIONS}</p>
            <h2 className="mt-1 text-xl font-semibold">Задай вопрос к тексту</h2>
            <p className="mt-1 text-muted">Чем глубже вопрос, тем больше очков. Ответ знать не нужно — обыграй ИИ!</p>
          </div>

          <ol className="grid grid-cols-2 gap-2 text-sm">
            {LADDER.map((l) => (
              <li key={l.label} className="rounded-2xl bg-primary-soft p-3">
                <span className="font-semibold text-primary">{l.label}</span> <span className="text-muted">+{l.points}</span>
                <span className="mt-0.5 block text-muted">{l.example}</span>
              </li>
            ))}
          </ol>

          {questions.length > 0 && (
            <ul className="space-y-2">
              {questions.map((q, i) => (
                <li key={i} className="rounded-2xl border-2 border-line px-4 py-3 text-sm">
                  <span className="text-muted">{i + 1}.</span> {q}
                </li>
              ))}
            </ul>
          )}

          <TextArea
            label={`Вопрос ${step + 1}`}
            placeholder="Например: почему…? что будет, если…?"
            value={draft}
            maxLength={MAX_QUESTION}
            onChange={(e) => setDraft(e.target.value)}
            error={error ?? undefined}
            autoFocus
          />
          <Button onClick={addQuestion} disabled={!draft.trim()}>
            {step + 1 < QUESTIONS ? 'Следующий вопрос' : 'К выводу'}
          </Button>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowText(!showText)}>
              {showText ? 'Скрыть текст' : 'Перечитать текст'}
            </Button>
            {text.hints.length > 0 && (
              <Button variant="secondary" onClick={() => setHint(hint + 1)}>
                Подсказка
              </Button>
            )}
          </div>
          {hint > 0 && text.hints.length > 0 && (
            <p className="rounded-2xl bg-pink-soft px-4 py-3 text-sm">💡 {text.hints[(hint - 1) % text.hints.length]}</p>
          )}
          {showText && (
            <div className="rounded-3xl border-2 border-line p-4">
              <Markdown source={text.body} />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-sm text-muted">Последний шаг</p>
            <h2 className="mt-1 text-xl font-semibold">Твой вывод</h2>
            <p className="mt-1 text-muted">Что главное ты понял из текста? 1–3 предложения своими словами. До +20 очков.</p>
          </div>
          <TextArea
            label="Вывод"
            placeholder="Главное в тексте — …"
            rows={4}
            value={conclusion}
            maxLength={MAX_CONCLUSION}
            onChange={(e) => setConclusion(e.target.value)}
            autoFocus
          />
          <Button onClick={finish} loading={saving}>
            Готово — узнать результат
          </Button>
          <button type="button" onClick={() => setShowText(!showText)} className="w-full text-center font-medium text-primary">
            {showText ? 'Скрыть текст' : 'Перечитать текст'}
          </button>
          {showText && (
            <div className="rounded-3xl border-2 border-line p-4">
              <Markdown source={text.body} />
            </div>
          )}
        </div>
      )}
    </AppLayout>
  )
}
