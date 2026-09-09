import { useState, type FormEvent } from 'react'
import { useContributeToGoal, useCreateGoal, useDeleteGoal } from '../hooks/use-finance'
import { formatBRL, parseReaisToCents, type Goal } from '../lib/api'
import { goalProgress } from '../lib/goal-progress'

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
      setError('Informe um valor alvo válido, ex.: 5.000,00')
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
      <h2>Metas de economia</h2>
      {loading ? (
        <p className="list-empty">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="list-empty">Nenhuma meta definida.</p>
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
            Meta
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Reserva de emergência"
              required
              maxLength={80}
            />
          </label>
          <label>
            Valor alvo (R$)
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="10.000,00"
              required
              inputMode="decimal"
            />
          </label>
          <label>
            Prazo (opcional)
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={createGoal.isPending}>
          {createGoal.isPending ? 'Salvando…' : 'Criar meta'}
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
      setError('Informe um aporte válido, ex.: 200,00')
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
          {goal.deadline && <span className="goal-deadline">até {formatDate(goal.deadline)}</span>}
        </span>
        <span className="goal-values">
          {formatBRL(goal.savedCents)} de {formatBRL(goal.targetCents)}
        </span>
        <span className="goal-percent">{progress.percent}%</span>
        <button
          type="button"
          className="delete-button"
          onClick={() => deleteGoal.mutate(goal.id)}
          disabled={deleteGoal.isPending}
        >
          Remover
        </button>
      </div>
      <div
        className="goal-bar"
        role="progressbar"
        aria-label={`Meta ${goal.name}`}
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="goal-bar-fill" style={{ width: `${progress.barPercent}%` }} />
      </div>
      <p className="goal-hint">
        {progress.done
          ? 'Meta alcançada.'
          : progress.overdue
            ? `Prazo vencido: faltam ${formatBRL(progress.remainingCents)}.`
            : progress.monthlyNeededCents !== null && progress.monthsLeft !== null
              ? `Guarde ${formatBRL(progress.monthlyNeededCents)} por mês ` +
                `(${progress.monthsLeft} ${progress.monthsLeft === 1 ? 'mês' : 'meses'}) para chegar lá.`
              : `Faltam ${formatBRL(progress.remainingCents)}.`}
      </p>
      {!progress.done && (
        <form className="goal-contribute" onSubmit={handleContribute}>
          <label>
            <span className="visually-hidden">Aporte para {goal.name} (R$)</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Aporte, ex.: 200,00"
              inputMode="decimal"
              required
            />
          </label>
          <button type="submit" disabled={contribute.isPending}>
            {contribute.isPending ? 'Guardando…' : 'Guardar'}
          </button>
          {error && <p className="form-error">{error}</p>}
        </form>
      )}
    </li>
  )
}
