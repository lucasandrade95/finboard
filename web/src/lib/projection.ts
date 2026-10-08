import type { BalanceProjection, DailyBalancePoint } from './api'

/** Quantos lançamentos previstos o painel lista antes de resumir o resto. */
export const UPCOMING_LIMIT = 6

/**
 * Data local (YYYY-MM-DD) do navegador. `toISOString` daria o dia em UTC: às 22h
 * em São Paulo já seria "amanhã", e a projeção pularia um dia.
 */
export function localToday(now: Date = new Date()): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * Série do gráfico: o saldo de hoje como primeiro ponto, seguido dos dias previstos.
 * Sem o ponto de partida a linha começaria já depois do primeiro movimento.
 */
export function projectionLinePoints(projection: BalanceProjection): DailyBalancePoint[] {
  return [
    {
      date: projection.from,
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
      balanceCents: projection.startingBalanceCents,
    },
    ...projection.items,
  ]
}
