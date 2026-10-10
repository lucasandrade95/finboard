import { describe, expect, it } from 'vitest'
import { EMPTY_RANGE, hasRange, isRangeInverted, periodParams } from './period'

describe('hasRange', () => {
  it('é falso sem nenhuma ponta e verdadeiro com qualquer uma', () => {
    expect(hasRange(EMPTY_RANGE)).toBe(false)
    expect(hasRange({})).toBe(false)
    expect(hasRange({ from: '2026-08-01', to: '' })).toBe(true)
    expect(hasRange({ from: '', to: '2026-08-31' })).toBe(true)
  })
})

describe('isRangeInverted', () => {
  it('detecta data final antes da inicial', () => {
    expect(isRangeInverted({ from: '2026-08-15', to: '2026-08-01' })).toBe(true)
  })

  it('aceita o mesmo dia nas duas pontas e intervalo aberto', () => {
    expect(isRangeInverted({ from: '2026-08-15', to: '2026-08-15' })).toBe(false)
    expect(isRangeInverted({ from: '2026-08-15', to: '' })).toBe(false)
    expect(isRangeInverted(EMPTY_RANGE)).toBe(false)
  })
})

describe('periodParams', () => {
  it('usa o mês quando não há período', () => {
    expect(periodParams('2026-08')).toEqual({ month: '2026-08' })
    expect(periodParams('2026-08', EMPTY_RANGE)).toEqual({ month: '2026-08' })
  })

  it('troca o mês pelo período e omite a ponta vazia', () => {
    expect(periodParams('2026-08', { from: '2026-07-20', to: '2026-08-10' })).toEqual({
      from: '2026-07-20',
      to: '2026-08-10',
    })
    expect(periodParams('2026-08', { from: '', to: '2026-08-10' })).toEqual({ to: '2026-08-10' })
  })
})
