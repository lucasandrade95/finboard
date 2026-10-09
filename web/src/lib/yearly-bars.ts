import type { MonthlyTotals } from './api'

// Geometria das barras anuais. Fora do componente para ser testável sem renderizar SVG.
export const BARS_WIDTH = 640
export const BARS_HEIGHT = 200
/** Folga interna para as barras não encostarem na borda do viewBox. */
export const BARS_PADDING = 12

const PLOT_LEFT = BARS_PADDING
const PLOT_RIGHT = BARS_WIDTH - BARS_PADDING
const PLOT_TOP = BARS_PADDING
/** Base das barras: a linha do zero do gráfico. */
export const BARS_BASELINE = BARS_HEIGHT - BARS_PADDING

/** Fração da coluna de cada mês ocupada pelo par de barras; o resto é respiro entre meses. */
const GROUP_FILL = 0.7

export interface Bar {
  x: number
  y: number
  width: number
  height: number
  cents: number
}

export interface MonthBars {
  month: string
  income: Bar
  expense: Bar
}

export interface YearlyBars {
  groups: MonthBars[]
  /** Maior barra do ano: é ela que encosta no topo da área de desenho. */
  maxCents: number
  /** Mês de maior despesa — o primeiro, em caso de empate. */
  topExpense: MonthTotalsRef
  /** Mês de melhor resultado (receitas − despesas) — o primeiro, em caso de empate. */
  bestNet: MonthTotalsRef
}

export interface MonthTotalsRef {
  month: string
  cents: number
}

function bar(x: number, width: number, cents: number, maxCents: number): Bar {
  // Escala linear a partir do zero: barra que não começa no zero mente sobre a proporção.
  const height = (cents / maxCents) * (BARS_BASELINE - PLOT_TOP)
  return {
    x: round(x),
    y: round(BARS_BASELINE - height),
    width: round(width),
    height: round(height),
    cents,
  }
}

/**
 * Converte os totais mensais em duas barras por mês (receita à esquerda, despesa à
 * direita), todas na mesma escala. Ano sem nenhum lançamento devolve `null`: não há
 * proporção a desenhar e a UI mostra o estado vazio.
 */
export function buildYearlyBars(items: MonthlyTotals[]): YearlyBars | null {
  const maxCents = Math.max(0, ...items.flatMap((item) => [item.incomeCents, item.expenseCents]))
  const first = items[0]
  if (maxCents === 0 || !first) {
    return null
  }

  const groupWidth = (PLOT_RIGHT - PLOT_LEFT) / items.length
  const barWidth = (groupWidth * GROUP_FILL) / 2
  const groups = items.map((item, index) => {
    const start = PLOT_LEFT + groupWidth * index + (groupWidth * (1 - GROUP_FILL)) / 2
    return {
      month: item.month,
      income: bar(start, barWidth, item.incomeCents, maxCents),
      expense: bar(start + barWidth, barWidth, item.expenseCents, maxCents),
    }
  })

  // Reduce com `>` estrito: no empate, fica o primeiro mês.
  const topExpense = items.reduce((top, item) =>
    item.expenseCents > top.expenseCents ? item : top,
  )
  const bestNet = items.reduce((best, item) => (item.netCents > best.netCents ? item : best))

  return {
    groups,
    maxCents,
    topExpense: { month: topExpense.month, cents: topExpense.expenseCents },
    bestNet: { month: bestNet.month, cents: bestNet.netCents },
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** `2026-03` → 2 (índice do mês). Corta a string em vez de usar `Date`, que aplicaria fuso. */
export function monthIndex(month: string): number {
  return Number(month.slice(5, 7)) - 1
}
