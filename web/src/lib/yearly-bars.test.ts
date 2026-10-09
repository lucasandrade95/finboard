import { describe, expect, it } from 'vitest'
import type { MonthlyTotals } from './api'
import { BARS_BASELINE, BARS_PADDING, buildYearlyBars, monthIndex } from './yearly-bars'

function year(totals: Array<[income: number, expense: number]>): MonthlyTotals[] {
  return Array.from({ length: 12 }, (_, index) => {
    const [incomeCents, expenseCents] = totals[index] ?? [0, 0]
    return {
      month: `2026-${String(index + 1).padStart(2, '0')}`,
      incomeCents,
      expenseCents,
      netCents: incomeCents - expenseCents,
    }
  })
}

describe('buildYearlyBars', () => {
  it('desenha um par de barras por mês, todas na mesma escala a partir do zero', () => {
    const chart = buildYearlyBars(
      year([
        [400000, 100000],
        [0, 200000],
      ]),
    )

    expect(chart?.groups).toHaveLength(12)
    expect(chart?.maxCents).toBe(400000)
    const [jan, fev] = chart?.groups ?? []
    const fullHeight = BARS_BASELINE - BARS_PADDING
    // A maior barra do ano encosta no topo; as outras ficam proporcionais a ela.
    expect(jan?.income.height).toBeCloseTo(fullHeight)
    expect(jan?.income.y).toBeCloseTo(BARS_PADDING)
    expect(jan?.expense.height).toBeCloseTo(fullHeight / 4)
    expect(fev?.expense.height).toBeCloseTo(fullHeight / 2)
    // Toda barra termina na linha de base.
    expect((fev?.expense.y ?? 0) + (fev?.expense.height ?? 0)).toBeCloseTo(BARS_BASELINE)
    // Mês sem receita vira barra de altura zero, não some do eixo.
    expect(fev?.income.height).toBe(0)
  })

  it('põe a receita à esquerda da despesa e os meses em ordem', () => {
    const chart = buildYearlyBars(
      year([
        [1000, 1000],
        [1000, 1000],
      ]),
    )
    const [jan, fev] = chart?.groups ?? []

    expect(jan?.income.x).toBeLessThan(jan?.expense.x ?? 0)
    expect((jan?.income.x ?? 0) + (jan?.income.width ?? 0)).toBeCloseTo(jan?.expense.x ?? 0)
    expect(fev?.income.x).toBeGreaterThan(jan?.expense.x ?? 0)
    expect(jan?.income.x).toBeGreaterThan(BARS_PADDING)
  })

  it('aponta o mês de maior despesa e o de melhor resultado', () => {
    const chart = buildYearlyBars(
      year([
        [100000, 90000],
        [300000, 50000],
        [100000, 250000],
      ]),
    )

    expect(chart?.topExpense).toEqual({ month: '2026-03', cents: 250000 })
    expect(chart?.bestNet).toEqual({ month: '2026-02', cents: 250000 })
  })

  it('no empate, fica o primeiro mês', () => {
    const chart = buildYearlyBars(
      year([
        [0, 5000],
        [0, 5000],
      ]),
    )

    expect(chart?.topExpense.month).toBe('2026-01')
  })

  it('devolve null para ano sem lançamentos', () => {
    expect(buildYearlyBars(year([]))).toBeNull()
    expect(buildYearlyBars([])).toBeNull()
  })
})

describe('monthIndex', () => {
  it('converte YYYY-MM no índice do mês', () => {
    expect(monthIndex('2026-01')).toBe(0)
    expect(monthIndex('2026-12')).toBe(11)
  })
})
