import { formatBRL, type DailyBalance } from '../lib/api'
import {
  buildBalanceLine,
  formatDayLabel,
  LINE_HEIGHT,
  LINE_PADDING,
  LINE_WIDTH,
} from '../lib/balance-line'

interface BalanceLineChartProps {
  data: DailyBalance | undefined
  loading: boolean
}

export function BalanceLineChart({ data, loading }: BalanceLineChartProps) {
  const chart = buildBalanceLine(data?.items ?? [])

  return (
    <section className="balance-line card" aria-busy={loading}>
      <h2>Evolução do saldo no mês</h2>
      {loading ? (
        <p className="list-empty">Carregando…</p>
      ) : !chart ? (
        <p className="list-empty">Sem dados para este mês.</p>
      ) : (
        <>
          {/* O SVG é decorativo: os mesmos números estão no resumo em texto abaixo. */}
          <svg
            className="line-chart"
            viewBox={`0 0 ${LINE_WIDTH} ${LINE_HEIGHT}`}
            preserveAspectRatio="none"
            role="presentation"
            aria-hidden="true"
          >
            <path className="line-area" d={chart.areaPath} />
            <line
              className="line-zero"
              x1={LINE_PADDING}
              x2={LINE_WIDTH - LINE_PADDING}
              y1={chart.zeroY}
              y2={chart.zeroY}
            />
            <path className="line-stroke" d={chart.linePath} />
            <circle className="line-dot" cx={chart.last.x} cy={chart.last.y} r={4} />
          </svg>
          <div className="line-axis">
            <span>{formatDayLabel(chart.points[0]?.date ?? '')}</span>
            <span>{formatDayLabel(chart.last.date)}</span>
          </div>
          <dl className="line-summary">
            <div>
              <dt>Saldo no fim do mês</dt>
              <dd className={chart.last.balanceCents < 0 ? 'negative' : 'positive'}>
                {formatBRL(chart.last.balanceCents)}
              </dd>
            </div>
            <div>
              <dt>Pico ({formatDayLabel(chart.highest.date)})</dt>
              <dd>{formatBRL(chart.highest.balanceCents)}</dd>
            </div>
            <div>
              <dt>Fundo ({formatDayLabel(chart.lowest.date)})</dt>
              <dd>{formatBRL(chart.lowest.balanceCents)}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  )
}
