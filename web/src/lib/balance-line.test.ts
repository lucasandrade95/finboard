import { describe, expect, it } from 'vitest'
import type { DailyBalancePoint } from './api'
import {
  buildBalanceLine,
  formatDayLabel,
  LINE_HEIGHT,
  LINE_PADDING,
  LINE_WIDTH,
} from './balance-line'

function series(balances: number[]): DailyBalancePoint[] {
  return balances.map((balanceCents, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, '0')}`,
    incomeCents: 0,
    expenseCents: 0,
    netCents: 0,
    balanceCents,
  }))
}

describe('buildBalanceLine', () => {
  it('distribui os dias na horizontal de borda a borda da área útil', () => {
    const chart = buildBalanceLine(series([0, 1000, 2000]))

    expect(chart?.points.map((point) => point.x)).toEqual([
      LINE_PADDING,
      LINE_WIDTH / 2,
      LINE_WIDTH - LINE_PADDING,
    ])
  })

  it('inverte o eixo vertical: maior saldo vira o menor y', () => {
    const chart = buildBalanceLine(series([0, 5000, 10000]))

    expect(chart?.points[0]?.y).toBeCloseTo(LINE_HEIGHT - LINE_PADDING)
    expect(chart?.points[2]?.y).toBeCloseTo(LINE_PADDING)
    expect(chart?.points[1]?.y).toBeCloseTo(LINE_HEIGHT / 2)
  })

  it('inclui o zero no domínio mesmo num mês só de despesas', () => {
    const chart = buildBalanceLine(series([-1000, -5000]))

    expect(chart?.maxCents).toBe(0)
    expect(chart?.minCents).toBe(-5000)
    // Zero é o topo do domínio, então a linha de referência fica no topo da área útil.
    expect(chart?.zeroY).toBeCloseTo(LINE_PADDING)
  })

  it('centraliza a linha quando o saldo fica zerado o mês inteiro', () => {
    const chart = buildBalanceLine(series([0, 0, 0]))

    expect(chart?.points.every((point) => point.y === LINE_HEIGHT / 2)).toBe(true)
    expect(chart?.zeroY).toBe(LINE_HEIGHT / 2)
  })

  it('fecha a área na linha do zero', () => {
    const chart = buildBalanceLine(series([1000, 2000]))

    expect(chart?.linePath.startsWith('M ')).toBe(true)
    expect(chart?.areaPath.startsWith(chart.linePath)).toBe(true)
    expect(chart?.areaPath.endsWith('Z')).toBe(true)
  })

  it('aponta pico, fundo e último dia', () => {
    const chart = buildBalanceLine(series([1000, 7000, 7000, -200, 3000]))

    expect(chart?.highest.balanceCents).toBe(7000)
    // Empate no pico: fica o primeiro dia em que aconteceu.
    expect(chart?.highest.date).toBe('2026-08-02')
    expect(chart?.lowest.date).toBe('2026-08-04')
    expect(chart?.last.balanceCents).toBe(3000)
  })

  it('centraliza o ponto único quando o mês tem um só dia', () => {
    const chart = buildBalanceLine(series([1000]))

    expect(chart?.points).toHaveLength(1)
    expect(chart?.points[0]?.x).toBe(LINE_WIDTH / 2)
  })

  it('devolve null sem dados', () => {
    expect(buildBalanceLine([])).toBeNull()
  })
})

describe('formatDayLabel', () => {
  it('mostra dia/mês sem passar pelo fuso do Date', () => {
    expect(formatDayLabel('2026-08-09')).toBe('09/08')
    expect(formatDayLabel('2026-12-31')).toBe('31/12')
  })
})
