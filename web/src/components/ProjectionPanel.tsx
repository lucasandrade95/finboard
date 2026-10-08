import { t } from '../i18n'
import { formatBRL, type BalanceProjection } from '../lib/api'
import {
  buildBalanceLine,
  formatDayLabel,
  LINE_HEIGHT,
  LINE_PADDING,
  LINE_WIDTH,
} from '../lib/balance-line'
import { projectionLinePoints, UPCOMING_LIMIT } from '../lib/projection'
import { Skeleton } from './Skeleton'

interface ProjectionPanelProps {
  data: BalanceProjection | undefined
  loading: boolean
}

function signClass(cents: number): 'negative' | 'positive' {
  return cents < 0 ? 'negative' : 'positive'
}

export function ProjectionPanel({ data, loading }: ProjectionPanelProps) {
  const chart = data ? buildBalanceLine(projectionLinePoints(data)) : null
  const upcoming = data?.events.slice(0, UPCOMING_LIMIT) ?? []
  const hidden = (data?.events.length ?? 0) - upcoming.length

  return (
    <section className="projection-panel card" aria-busy={loading}>
      <h2>{t.projection.title}</h2>
      {loading || !data || !chart ? (
        <Skeleton shape="chart" lines={1} label={t.projection.loading} />
      ) : (
        <>
          {data.lowestBalanceCents < 0 && (
            <p className="projection-alert" role="alert">
              {t.projection.negativeAlert(
                formatDayLabel(data.lowestBalanceOn),
                formatBRL(data.lowestBalanceCents),
              )}
            </p>
          )}
          {/* Decorativo, como o gráfico do mês: os números estão no resumo em texto abaixo. */}
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
            <span>{formatDayLabel(data.from)}</span>
            <span>{formatDayLabel(data.to)}</span>
          </div>
          <dl className="line-summary">
            <div>
              <dt>{t.projection.today}</dt>
              <dd className={signClass(data.startingBalanceCents)}>
                {formatBRL(data.startingBalanceCents)}
              </dd>
            </div>
            <div>
              <dt>{t.projection.ending(formatDayLabel(data.to))}</dt>
              <dd className={signClass(data.endingBalanceCents)}>
                {formatBRL(data.endingBalanceCents)}
              </dd>
            </div>
            <div>
              <dt>{t.projection.lowest(formatDayLabel(data.lowestBalanceOn))}</dt>
              <dd className={signClass(data.lowestBalanceCents)}>
                {formatBRL(data.lowestBalanceCents)}
              </dd>
            </div>
          </dl>
          <h3 className="projection-upcoming-title">{t.projection.upcoming}</h3>
          {upcoming.length === 0 ? (
            <p className="list-empty">{t.projection.empty}</p>
          ) : (
            <ul className="projection-events">
              {upcoming.map((event, index) => (
                <li key={`${event.date}-${event.description}-${index}`}>
                  <span className="projection-date">{formatDayLabel(event.date)}</span>
                  <span className="projection-description">
                    {event.description}
                    <span className="recurring-tag">{t.projection.sources[event.source]}</span>
                  </span>
                  <span className={event.type === 'income' ? 'positive' : 'negative'}>
                    {formatBRL(event.type === 'income' ? event.amountCents : -event.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {hidden > 0 && <p className="projection-more">{t.projection.more(hidden)}</p>}
        </>
      )}
    </section>
  )
}
