import { describe, expect, it } from 'vitest'
import { budgetStatus, WARNING_THRESHOLD } from './budget-status'

describe('budgetStatus', () => {
  it('fica "ok" abaixo do limiar de atenção', () => {
    expect(budgetStatus(30000, 80000)).toEqual({
      percent: 38,
      barPercent: 38,
      level: 'ok',
      overCents: 0,
    })
  })

  it('entra em "warning" a partir do limiar, ainda dentro do limite', () => {
    const atThreshold = budgetStatus(WARNING_THRESHOLD * 1000, 100000)
    expect(atThreshold.level).toBe('warning')
    expect(atThreshold.overCents).toBe(0)

    const justBelow = budgetStatus(WARNING_THRESHOLD * 1000 - 1000, 100000)
    expect(justBelow.level).toBe('ok')
  })

  it('gasto exatamente no limite é 100% mas não estourou', () => {
    expect(budgetStatus(50000, 50000)).toEqual({
      percent: 100,
      barPercent: 100,
      level: 'warning',
      overCents: 0,
    })
  })

  it('marca "over" a partir de um centavo acima do limite, mesmo que arredonde para 100%', () => {
    const status = budgetStatus(50001, 50000)
    expect(status.level).toBe('over')
    expect(status.overCents).toBe(1)
    expect(status.percent).toBe(100)
  })

  it('mantém o percentual real acima de 100 e satura só a barra', () => {
    expect(budgetStatus(75000, 50000)).toEqual({
      percent: 150,
      barPercent: 100,
      level: 'over',
      overCents: 25000,
    })
  })

  it('gasto zero é 0% e ok', () => {
    expect(budgetStatus(0, 50000)).toEqual({
      percent: 0,
      barPercent: 0,
      level: 'ok',
      overCents: 0,
    })
  })
})
