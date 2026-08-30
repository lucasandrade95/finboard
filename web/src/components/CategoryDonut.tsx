import { formatBRL, type ExpensesByCategory } from '../lib/api'
import {
  buildDonutSlices,
  formatPercent,
  DONUT_CENTER,
  DONUT_CIRCUMFERENCE,
  DONUT_RADIUS,
  DONUT_SIZE,
  DONUT_STROKE,
} from '../lib/donut'

interface CategoryDonutProps {
  data: ExpensesByCategory | undefined
  loading: boolean
}

export function CategoryDonut({ data, loading }: CategoryDonutProps) {
  const slices = buildDonutSlices(data?.items ?? [])

  return (
    <section className="category-donut card" aria-busy={loading}>
      <h2>Despesas por categoria</h2>
      {loading ? (
        <p className="list-empty">Carregando…</p>
      ) : slices.length === 0 ? (
        <p className="list-empty">Nenhuma despesa neste mês.</p>
      ) : (
        <div className="donut-body">
          {/* O SVG é decorativo: a legenda ao lado carrega os mesmos números em texto. */}
          <svg
            className="donut"
            viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
            width={DONUT_SIZE}
            height={DONUT_SIZE}
            aria-hidden="true"
          >
            {/* rotate(-90): sem isso o dasharray começaria às 3 horas, não no topo. */}
            <g transform={`rotate(-90 ${DONUT_CENTER} ${DONUT_CENTER})`}>
              {slices.map((slice) => (
                <circle
                  key={slice.category}
                  cx={DONUT_CENTER}
                  cy={DONUT_CENTER}
                  r={DONUT_RADIUS}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={DONUT_STROKE}
                  strokeDasharray={`${slice.dashLength} ${DONUT_CIRCUMFERENCE - slice.dashLength}`}
                  strokeDashoffset={slice.dashOffset}
                />
              ))}
            </g>
            <text className="donut-label" x={DONUT_CENTER} y={DONUT_CENTER - 4}>
              Total
            </text>
            <text className="donut-total" x={DONUT_CENTER} y={DONUT_CENTER + 16}>
              {formatBRL(data?.totalCents ?? 0)}
            </text>
          </svg>
          <ul className="donut-legend">
            {slices.map((slice) => (
              <li key={slice.category}>
                <span className="donut-swatch" style={{ background: slice.color }} />
                <span className="donut-category">{slice.category}</span>
                <span className="donut-value">{formatBRL(slice.totalCents)}</span>
                <span className="donut-percent">{formatPercent(slice.percent)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
