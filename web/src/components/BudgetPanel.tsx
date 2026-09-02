import { useState, type FormEvent } from 'react'
import { useDeleteBudget, useUpsertBudget } from '../hooks/use-finance'
import { formatBRL, parseReaisToCents, type BudgetProgressList } from '../lib/api'

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    let amountCents: number
    try {
      amountCents = parseReaisToCents(amount)
    } catch {
      setError('Informe um valor válido, ex.: 800,00')
      return
    }
    if (amountCents <= 0) {
      setError('O valor precisa ser maior que zero')
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
      <h2>Orçamento por categoria</h2>
      {loading ? (
        <p className="list-empty">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="list-empty">Nenhum orçamento definido.</p>
      ) : (
        <ul className="budget-list">
          {items.map((item) => {
            const percent = Math.round((item.spentCents / item.budgetCents) * 100)
            return (
              <li key={item.category}>
                <div className="budget-row">
                  <span className="budget-category">{item.category}</span>
                  <span className="budget-values">
                    {formatBRL(item.spentCents)} de {formatBRL(item.budgetCents)}
                  </span>
                  <span className="budget-percent">{percent}%</span>
                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => deleteBudget.mutate(item.category)}
                    disabled={deleteBudget.isPending}
                  >
                    Remover
                  </button>
                </div>
                <div
                  className="budget-bar"
                  role="progressbar"
                  aria-label={`Orçamento de ${item.category}`}
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  {/* Barra satura em 100%; o percentual em texto segue além (estouro é o próximo passo do roadmap). */}
                  <div
                    className="budget-bar-fill"
                    style={{ width: `${Math.min(100, percent)}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <form className="budget-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            Categoria
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="mercado"
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
            Limite mensal (R$)
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
          {upsertBudget.isPending ? 'Salvando…' : 'Definir orçamento'}
        </button>
      </form>
    </section>
  )
}
