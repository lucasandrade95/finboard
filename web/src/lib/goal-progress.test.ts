import { describe, expect, it } from 'vitest'
import { goalProgress } from './goal-progress'

const TODAY = '2026-09-09'

describe('goalProgress', () => {
  it('calcula percentual, restante e quanto guardar por mês até o prazo', () => {
    expect(
      goalProgress({ targetCents: 500000, savedCents: 200000, deadline: '2026-12-31' }, TODAY),
    ).toEqual({
      percent: 40,
      barPercent: 40,
      remainingCents: 300000,
      done: false,
      overdue: false,
      monthsLeft: 3,
      monthlyNeededCents: 100000,
    })
  })

  it('arredonda o aporte mensal para cima para não faltar centavo no fim', () => {
    const progress = goalProgress(
      { targetCents: 100000, savedCents: 0, deadline: '2026-12-31' },
      TODAY,
    )
    expect(progress.monthlyNeededCents).toBe(33334)
  })

  it('prazo no mesmo mês conta como um mês: guarda tudo agora', () => {
    const progress = goalProgress(
      { targetCents: 100000, savedCents: 40000, deadline: '2026-09-30' },
      TODAY,
    )
    expect(progress.monthsLeft).toBe(1)
    expect(progress.monthlyNeededCents).toBe(60000)
  })

  it('atravessa a virada de ano ao contar meses', () => {
    const progress = goalProgress(
      { targetCents: 100000, savedCents: 0, deadline: '2027-03-01' },
      TODAY,
    )
    expect(progress.monthsLeft).toBe(6)
  })

  it('sem prazo não sugere aporte mensal', () => {
    const progress = goalProgress({ targetCents: 100000, savedCents: 25000, deadline: null }, TODAY)
    expect(progress.monthsLeft).toBeNull()
    expect(progress.monthlyNeededCents).toBeNull()
    expect(progress.overdue).toBe(false)
  })

  it('marca como vencida quando o prazo passou sem alcançar a meta', () => {
    const progress = goalProgress(
      { targetCents: 100000, savedCents: 25000, deadline: '2026-09-08' },
      TODAY,
    )
    expect(progress.overdue).toBe(true)
    expect(progress.monthsLeft).toBeNull()
    expect(progress.monthlyNeededCents).toBeNull()
  })

  it('meta alcançada não fica vencida mesmo com prazo passado', () => {
    const progress = goalProgress(
      { targetCents: 100000, savedCents: 100000, deadline: '2026-01-01' },
      TODAY,
    )
    expect(progress.done).toBe(true)
    expect(progress.overdue).toBe(false)
    expect(progress.remainingCents).toBe(0)
    expect(progress.monthlyNeededCents).toBeNull()
  })

  it('satura a barra em 100% mas mantém o percentual real quando passa da meta', () => {
    const progress = goalProgress(
      { targetCents: 100000, savedCents: 120000, deadline: null },
      TODAY,
    )
    expect(progress.percent).toBe(120)
    expect(progress.barPercent).toBe(100)
    expect(progress.done).toBe(true)
  })
})
