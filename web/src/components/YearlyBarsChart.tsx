import { t } from '../i18n'
import { formatBRL, type YearlySummary } from '../lib/api'
import {
  BARS_BASELINE,
  BARS_HEIGHT,
  BARS_PADDING,
  BARS_WIDTH,
  buildYearlyBars,
  monthIndex,
} from '../lib/yearly-bars'
import { Skeleton } from './Skeleton'

interface YearlyBarsChartProps {
  year: string
  data: YearlySummary | undefined
  loading: boolean
}

function monthName(month: string): string {
  return t.yearlyBars.months[monthIndex(month)] ?? month
}

export function YearlyBarsChart({ year, data, loading }: YearlyBarsChartProps) {
  const chart = buildYearlyBars(data?.items ?? [])

  return (
    <section className="yearly-bars card" aria-busy={loading}>
      <h2>{t.yearlyBars.title(year)}</h2>
      {loading ? (
        <Skeleton shape="chart" lines={1} label={t.yearlyBars.loading} />
      ) : !chart || !data ? (
        <p className="list-empty">{t.yearlyBars.empty}</p>
      ) : (
        <>
          <ul className="bars-legend">
            <li className="legend-income">{t.yearlyBars.income}</li>
            <li className="legend-expense">{t.yearlyBars.expense}</li>
          </ul>
          {/* O SVG é decorativo: os mesmos números estão na tabela oculta e no resumo abaixo. */}
          <svg
            className="bars-chart"
            viewBox={`0 0 ${BARS_WIDTH} ${BARS_HEIGHT}`}
            preserveAspectRatio="none"
            role="presentation"
            aria-hidden="true"
          >
            {chart.groups.map((group) => (
              <g key={group.month}>
                <rect className="bar-income" {...group.income} />
                <rect className="bar-expense" {...group.expense} />
              </g>
            ))}
            <line
              className="line-zero"
              x1={BARS_PADDING}
              x2={BARS_WIDTH - BARS_PADDING}
              y1={BARS_BASELINE}
              y2={BARS_BASELINE}
            />
          </svg>
          <div className="bars-axis" aria-hidden="true">
            {chart.groups.map((group) => (
              <span key={group.month}>{monthName(group.month)}</span>
            ))}
          </div>
          <table className="visually-hidden">
            <caption>{t.yearlyBars.title(year)}</caption>
            <thead>
              <tr>
                <th scope="col">{t.yearlyBars.month}</th>
                <th scope="col">{t.yearlyBars.income}</th>
                <th scope="col">{t.yearlyBars.expense}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.month}>
                  <th scope="row">{monthName(item.month)}</th>
                  <td>{formatBRL(item.incomeCents)}</td>
                  <td>{formatBRL(item.expenseCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="line-summary">
            <div>
              <dt>{t.yearlyBars.yearNet}</dt>
              <dd className={data.netCents < 0 ? 'negative' : 'positive'}>
                {formatBRL(data.netCents)}
              </dd>
            </div>
            <div>
              <dt>{t.yearlyBars.topExpense(monthName(chart.topExpense.month))}</dt>
              <dd>{formatBRL(chart.topExpense.cents)}</dd>
            </div>
            <div>
              <dt>{t.yearlyBars.bestNet(monthName(chart.bestNet.month))}</dt>
              <dd className={chart.bestNet.cents < 0 ? 'negative' : 'positive'}>
                {formatBRL(chart.bestNet.cents)}
              </dd>
            </div>
          </dl>
        </>
      )}
    </section>
  )
}
