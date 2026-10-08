import { describe, expect, it } from 'vitest'
import type { BalanceProjection } from './api'
import { localToday, projectionLinePoints } from './projection'

describe('localToday', () => {
  it('usa a data do relógio local, não a de UTC', () => {
    // 23h do dia 8 no horário local: em UTC (no Brasil) já seria dia 9.
    expect(localToday(new Date(2026, 9, 8, 23, 30))).toBe('2026-10-08')
    expect(localToday(new Date(2027, 0, 1, 0, 5))).toBe('2027-01-01')
  })
})

describe('projectionLinePoints', () => {
  it('abre a série com o saldo de hoje antes dos dias previstos', () => {
    const projection: BalanceProjection = {
      from: '2026-10-08',
      to: '2026-10-09',
      startingBalanceCents: 50000,
      endingBalanceCents: 30000,
      lowestBalanceCents: 30000,
      lowestBalanceOn: '2026-10-09',
      events: [],
      items: [
        {
          date: '2026-10-09',
          incomeCents: 0,
          expenseCents: 20000,
          netCents: -20000,
          balanceCents: 30000,
        },
      ],
    }

    expect(
      projectionLinePoints(projection).map((point) => [point.date, point.balanceCents]),
    ).toEqual([
      ['2026-10-08', 50000],
      ['2026-10-09', 30000],
    ])
  })
})
