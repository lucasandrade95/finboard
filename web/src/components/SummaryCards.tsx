import { formatBRL, type MonthlySummary } from '../lib/api'

interface SummaryCardsProps {
  summary: MonthlySummary | undefined
  loading: boolean
}

function formatDelta(cents: number): string {
  return `${cents >= 0 ? '+' : '-'}${formatBRL(Math.abs(cents))}`
}

export function SummaryCards({ summary, loading }: SummaryCardsProps) {
  const balance = summary?.balanceCents ?? 0
  const previous = summary?.previous
  const cards = [
    {
      label: 'Receitas',
      value: summary?.incomeCents ?? 0,
      tone: 'positive',
      deltaCents: previous ? (summary?.incomeCents ?? 0) - previous.incomeCents : undefined,
      // Receita maior que a do mês anterior é boa notícia; despesa maior, não.
      goodWhenUp: true,
    },
    {
      label: 'Despesas',
      value: summary?.expenseCents ?? 0,
      tone: 'negative',
      deltaCents: previous ? (summary?.expenseCents ?? 0) - previous.expenseCents : undefined,
      goodWhenUp: false,
    },
    {
      label: 'Saldo',
      value: balance,
      tone: balance >= 0 ? 'positive' : 'negative',
      deltaCents: previous ? balance - previous.balanceCents : undefined,
      goodWhenUp: true,
    },
  ]

  return (
    <section className="summary-cards" aria-busy={loading}>
      {cards.map((card) => (
        <article key={card.label} className={`card ${card.tone}`}>
          <h2>{card.label}</h2>
          <p className="card-value">{loading ? '—' : formatBRL(card.value)}</p>
          {!loading && card.deltaCents !== undefined && (
            <p
              className={`card-delta ${
                card.deltaCents === 0
                  ? ''
                  : card.deltaCents > 0 === card.goodWhenUp
                    ? 'positive'
                    : 'negative'
              }`}
            >
              {formatDelta(card.deltaCents)} vs mês anterior
            </p>
          )}
        </article>
      ))}
    </section>
  )
}
