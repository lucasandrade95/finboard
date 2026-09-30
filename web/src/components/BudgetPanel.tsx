import { useState, type FormEvent } from 'react'
import { useDeleteBudget, useUpsertBudget } from '../hooks/use-finance'
import { t } from '../i18n'
import { formatBRL, parseReaisToCents, type BudgetProgressList } from '../lib/api'
import { budgetStatus } from '../lib/budget-status'
import { Skeleton } from './Skeleton'

interface BudgetPanelProps {
  data: BudgetProgressList | undefined
  loading: boolean
  categories?: string[]
}

export function BudgetPanel({ data, loading, categories = [] }: BudgetPanelProps) {
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const upsertBudget = useUpsertBudget()
  const deleteBudget = useDeleteBudget()
  const items = data?.items ?? []
  const overCount = items.filter(
    (item) => budgetStatus(item.spentCents, item.budgetCents).level === 'over',
  ).length

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    let amountCents: number
    try {
      amountCents = parseReaisToCents(amount)
    } catch {
      setError(t.common.invalidAmount('800,00'))
      return
    }
    if (amountCents <= 0) {
      setError(t.common.amountMustBePositive)
      return
    }

    upsertBudget.mutate(
      { category: category.trim(), amountCents },
      {
        onSuccess: () => {
          setCategory('')
          setAmount('')
        },
        onError: (mutationError) => setError(mutationError.message),
      },
    )
  }

  return (
    <section className="budget-panel card" aria-busy={loading}>
      <h2>{t.budgets.title}</h2>
      {overCount > 0 && (
        <p className="budget-alert" role="alert">
          {t.budgets.overAlert(overCount)}
        </p>
      )}
      {loading ? (
        <Skeleton lines={3} label={t.budgets.loading} />
      ) : items.length === 0 ? (
        <p className="list-empty">{t.budgets.empty}</p>
      ) : (
        <ul className="budget-list">
          {items.map((item) => {
            const status = budgetStatus(item.spentCents, item.budgetCents)
            return (
              <li key={item.category} className={`budget-item ${status.level}`}>
                <div className="budget-row">
                  <span className="budget-category">
                    {item.category}
                    {status.level === 'over' && (
                      <span className="budget-badge">
                        {t.budgets.overBy(formatBRL(status.overCents))}
                      </span>
                    )}
                    {status.level === 'warning' && (
                      <span className="budget-badge">{t.budgets.nearLimit}</span>
                    )}
                  </span>
                  <span className="budget-values">
                    {t.budgets.spentOf(formatBRL(item.spentCents), formatBRL(item.budgetCents))}
                  </span>
                  <span className="budget-percent">{status.percent}%</span>
                  <button
                    type="button"
                    className="delete-button"
                    aria-label={t.budgets.removeLabel(item.category)}
                    onClick={() => deleteBudget.mutate(item.category)}
                    disabled={deleteBudget.isPending}
                  >
                    {t.common.remove}
                  </button>
                </div>
                <div
                  className="budget-bar"
                  role="progressbar"
                  aria-label={t.budgets.progressLabel(item.category)}
                  aria-valuenow={status.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  {/* Barra satura em 100%; o percentual real fica no texto e o estouro na cor + etiqueta. */}
                  <div className="budget-bar-fill" style={{ width: `${status.barPercent}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <form className="budget-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            {t.common.category}
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t.budgets.categoryPlaceholder}
              required
              maxLength={50}
              list="budget-category-suggestions"
            />
            <datalist id="budget-category-suggestions">
              {categories.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label>
            {t.budgets.limitInput}
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="800,00"
              required
              inputMode="decimal"
            />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={upsertBudget.isPending}>
          {upsertBudget.isPending ? t.common.saving : t.budgets.submit}
        </button>
      </form>
    </section>
  )
}
