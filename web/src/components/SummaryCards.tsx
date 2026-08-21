import { formatBRL, type MonthlySummary } from '../lib/api'

interface SummaryCardsProps {
  summary: MonthlySummary | undefined
  loading: boolean
}

export function SummaryCards({ summary, loading }: SummaryCardsProps) {
  const balance = summary?.balanceCents ?? 0
  const cards = [
    { label: 'Receitas', value: summary?.incomeCents ?? 0, tone: 'positive' },
    { label: 'Despesas', value: summary?.expenseCents ?? 0, tone: 'negative' },
    { label: 'Saldo', value: balance, tone: balance >= 0 ? 'positive' : 'negative' },
  ]

  return (
    <section className="summary-cards" aria-busy={loading}>
      {cards.map((card) => (
        <article key={card.label} className={`card ${card.tone}`}>
          <h2>{card.label}</h2>
          <p className="card-value">{loading ? '—' : formatBRL(card.value)}</p>
        </article>
      ))}
    </section>
  )
}
