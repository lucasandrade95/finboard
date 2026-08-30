import type { DailyBalancePoint } from './api'

// Geometria da linha de saldo. Fora do componente para ser testável sem renderizar SVG.
export const LINE_WIDTH = 640
export const LINE_HEIGHT = 180
/** Folga interna para o traço e os marcadores não encostarem na borda do viewBox. */
export const LINE_PADDING = 12

const PLOT_LEFT = LINE_PADDING
const PLOT_RIGHT = LINE_WIDTH - LINE_PADDING
const PLOT_TOP = LINE_PADDING
const PLOT_BOTTOM = LINE_HEIGHT - LINE_PADDING

export interface LinePoint {
  date: string
  balanceCents: number
  x: number
  y: number
}

export interface BalanceLine {
  points: LinePoint[]
  /** `d` da polilinha do saldo. */
  linePath: string
  /** `d` da área entre a linha e a linha do zero (mesma forma, fechada na base). */
  areaPath: string
  /** Altura do zero no viewBox — a linha de referência do gráfico. */
  zeroY: number
  minCents: number
  maxCents: number
  highest: LinePoint
  lowest: LinePoint
  last: LinePoint
}

function scaleX(index: number, count: number): number {
  if (count <= 1) {
    return (PLOT_LEFT + PLOT_RIGHT) / 2
  }
  return PLOT_LEFT + ((PLOT_RIGHT - PLOT_LEFT) * index) / (count - 1)
}

function scaleY(valueCents: number, minCents: number, maxCents: number): number {
  const span = maxCents - minCents
  // Mês inteiro em zero: sem span não há proporção, então a linha vai para o meio.
  if (span === 0) {
    return (PLOT_TOP + PLOT_BOTTOM) / 2
  }
  // SVG cresce para baixo: o maior valor tem que virar o menor y.
  return PLOT_BOTTOM - ((valueCents - minCents) / span) * (PLOT_BOTTOM - PLOT_TOP)
}

/**
 * Converte o saldo acumulado de cada dia em coordenadas do viewBox. O domínio sempre
 * inclui o zero: assim a linha de referência aparece no gráfico e um mês só de despesas
 * é lido como queda, não como uma linha reta no meio da caixa.
 */
export function buildBalanceLine(items: DailyBalancePoint[]): BalanceLine | null {
  if (items.length === 0) {
    return null
  }

  const balances = items.map((item) => item.balanceCents)
  const minCents = Math.min(0, ...balances)
  const maxCents = Math.max(0, ...balances)

  const points: LinePoint[] = items.map((item, index) => ({
    date: item.date,
    balanceCents: item.balanceCents,
    x: scaleX(index, items.length),
    y: scaleY(item.balanceCents, minCents, maxCents),
  }))

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${round(point.x)} ${round(point.y)}`)
    .join(' ')
  const zeroY = scaleY(0, minCents, maxCents)
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) {
    return null
  }
  const areaPath = `${linePath} L ${round(last.x)} ${round(zeroY)} L ${round(first.x)} ${round(zeroY)} Z`

  // Reduce em vez de indexOf(Math.max(...)): o primeiro dia do pico é o que interessa.
  const highest = points.reduce((best, point) =>
    point.balanceCents > best.balanceCents ? point : best,
  )
  const lowest = points.reduce((worst, point) =>
    point.balanceCents < worst.balanceCents ? point : worst,
  )

  return { points, linePath, areaPath, zeroY, minCents, maxCents, highest, lowest, last }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** `2026-08-09` → `09/08`. Corta a string em vez de usar `Date`, que aplicaria fuso. */
export function formatDayLabel(date: string): string {
  const [, month, day] = date.split('-')
  return `${day ?? '??'}/${month ?? '??'}`
}
