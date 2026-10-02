import { t } from '../i18n'
import { formatBRL, type MonthlySummary } from '../lib/api'
import { Skeleton } from './Skeleton'

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
      label: t.summary.income,
      value: summary?.incomeCents ?? 0,
      tone: 'positive',
      deltaCents: previous ? (summary?.incomeCents ?? 0) - previous.incomeCents : undefined,
      // Receita maior que a do mês anterior é boa notícia; despesa maior, não.
      goodWhenUp: true,
    },
    {
      label: t.summary.expense,
      value: summary?.expenseCents ?? 0,
      tone: 'negative',
      deltaCents: previous ? (summary?.expenseCents ?? 0) - previous.expenseCents : undefined,
      goodWhenUp: false,
    },
    {
      label: t.summary.balance,
      value: balance,
      tone: balance >= 0 ? 'positive' : 'negative',
      deltaCents: previous ? balance - previous.balanceCents : undefined,
      goodWhenUp: true,
    },
  ]

  const accounts = summary?.accounts ?? []

  return (
    <>
      <section className="summary-cards" aria-busy={loading}>
        {cards.map((card) => (
          <article key={card.label} className={`card ${card.tone}`}>
            <h2>{card.label}</h2>
            <p className="card-value">
              {loading ? (
                <Skeleton shape="value" lines={1} label={t.summary.loadingCard(card.label)} />
              ) : (
                formatBRL(card.value)
              )}
            </p>
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
                {t.summary.vsPreviousMonth(formatDelta(card.deltaCents))}
              </p>
            )}
          </article>
        ))}
      </section>
      {/* Só para quem usa contas: sem nenhuma cadastrada, o resumo fica como sempre foi. */}
      {!loading && accounts.length > 0 && (
        <section className="account-balances card" aria-labelledby="account-balances-title">
          <h2 id="account-balances-title">{t.summary.byAccount}</h2>
          <ul className="account-list">
            {accounts.map((account) => (
              <li key={account.id} className="account-item">
                <span className="account-name">{account.name}</span>
                <span className={`account-balance ${account.balanceCents < 0 ? 'negative' : ''}`}>
                  {formatBRL(account.balanceCents)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
