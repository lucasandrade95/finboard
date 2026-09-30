import { useState, type FormEvent } from 'react'
import { useContributeToGoal, useCreateGoal, useDeleteGoal } from '../hooks/use-finance'
import { t } from '../i18n'
import { formatBRL, parseReaisToCents, type Goal } from '../lib/api'
import { goalProgress } from '../lib/goal-progress'
import { Skeleton } from './Skeleton'

interface GoalsPanelProps {
  goals: Goal[] | undefined
  loading: boolean
  /** Data de referência (YYYY-MM-DD) para prazo e aporte mensal; testes injetam. */
  today?: string
}

function localToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

function parsePositiveAmount(value: string): number | null {
  try {
    const cents = parseReaisToCents(value)
    return cents > 0 ? cents : null
  } catch {
    return null
  }
}

export function GoalsPanel({ goals, loading, today = localToday() }: GoalsPanelProps) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState<string | null>(null)
  const createGoal = useCreateGoal()
  const items = goals ?? []

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const targetCents = parsePositiveAmount(target)
    if (targetCents === null) {
      setError(t.goals.invalidTarget)
      return
    }

    createGoal.mutate(
      { name: name.trim(), targetCents, deadline: deadline || null },
      {
        onSuccess: () => {
          setName('')
          setTarget('')
          setDeadline('')
        },
        onError: (mutationError) => setError(mutationError.message),
      },
    )
  }

  return (
    <section className="goals-panel card" aria-busy={loading}>
      <h2>{t.goals.title}</h2>
      {loading ? (
        <Skeleton lines={2} label={t.goals.loading} />
      ) : items.length === 0 ? (
        <p className="list-empty">{t.goals.empty}</p>
      ) : (
        <ul className="goal-list">
          {items.map((goal) => (
            <GoalItem key={goal.id} goal={goal} today={today} />
          ))}
        </ul>
      )}
      <form className="goal-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            {t.goals.name}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.goals.namePlaceholder}
              required
              maxLength={80}
            />
          </label>
          <label>
            {t.goals.targetInput}
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={t.goals.targetPlaceholder}
              required
              inputMode="decimal"
            />
          </label>
          <label>
            {t.goals.deadlineInput}
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={createGoal.isPending}>
          {createGoal.isPending ? t.common.saving : t.goals.submit}
        </button>
      </form>
    </section>
  )
}

interface GoalItemProps {
  goal: Goal
  today: string
}

function GoalItem({ goal, today }: GoalItemProps) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const contribute = useContributeToGoal()
  const deleteGoal = useDeleteGoal()
  const progress = goalProgress(goal, today)
  const level = progress.done ? 'done' : progress.overdue ? 'overdue' : 'active'

  function handleContribute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const amountCents = parsePositiveAmount(amount)
    if (amountCents === null) {
      setError(t.goals.invalidContribution)
      return
    }
    contribute.mutate(
      { id: goal.id, amountCents },
      {
        onSuccess: () => setAmount(''),
        onError: (mutationError) => setError(mutationError.message),
      },
    )
  }

  return (
    <li className={`goal-item ${level}`}>
      <div className="goal-row">
        <span className="goal-name">
          {goal.name}
          {goal.deadline && (
            <span className="goal-deadline">{t.goals.deadline(formatDate(goal.deadline))}</span>
          )}
        </span>
        <span className="goal-values">
          {t.goals.savedOf(formatBRL(goal.savedCents), formatBRL(goal.targetCents))}
        </span>
        <span className="goal-percent">{progress.percent}%</span>
        <button
          type="button"
          className="delete-button"
          aria-label={t.goals.removeLabel(goal.name)}
          onClick={() => deleteGoal.mutate(goal.id)}
          disabled={deleteGoal.isPending}
        >
          {t.common.remove}
        </button>
      </div>
      <div
        className="goal-bar"
        role="progressbar"
        aria-label={t.goals.progressLabel(goal.name)}
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="goal-bar-fill" style={{ width: `${progress.barPercent}%` }} />
      </div>
      <p className="goal-hint">
        {progress.done
          ? t.goals.done
          : progress.overdue
            ? t.goals.overdue(formatBRL(progress.remainingCents))
            : progress.monthlyNeededCents !== null && progress.monthsLeft !== null
              ? t.goals.monthlyNeeded(formatBRL(progress.monthlyNeededCents), progress.monthsLeft)
              : t.goals.remaining(formatBRL(progress.remainingCents))}
      </p>
      {!progress.done && (
        <form className="goal-contribute" onSubmit={handleContribute}>
          <label>
            <span className="visually-hidden">{t.goals.contributionLabel(goal.name)}</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t.goals.contributionPlaceholder}
              inputMode="decimal"
              required
            />
          </label>
          <button type="submit" disabled={contribute.isPending}>
            {contribute.isPending ? t.goals.contributing : t.goals.contribute}
          </button>
          {error && <p className="form-error">{error}</p>}
        </form>
      )}
    </li>
  )
}
