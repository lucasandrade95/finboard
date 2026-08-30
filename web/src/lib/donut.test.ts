import { describe, expect, it } from 'vitest'
import {
  buildDonutSlices,
  formatPercent,
  DONUT_CIRCUMFERENCE,
  MAX_SLICES,
  OTHERS_LABEL,
} from './donut'

describe('buildDonutSlices', () => {
  it('reparte a circunferência na proporção de cada categoria', () => {
    const slices = buildDonutSlices([
      { category: 'aluguel', totalCents: 75000 },
      { category: 'mercado', totalCents: 25000 },
    ])

    expect(slices.map((s) => s.category)).toEqual(['aluguel', 'mercado'])
    expect(slices[0]?.percent).toBeCloseTo(75)
    expect(slices[1]?.percent).toBeCloseTo(25)
    expect(slices[0]?.dashLength).toBeCloseTo(DONUT_CIRCUMFERENCE * 0.75)
    const consumed = slices.reduce((sum, s) => sum + s.dashLength, 0)
    expect(consumed).toBeCloseTo(DONUT_CIRCUMFERENCE)
  })

  it('encadeia as fatias com offset acumulado e negativo', () => {
    const slices = buildDonutSlices([
      { category: 'a', totalCents: 5000 },
      { category: 'b', totalCents: 3000 },
      { category: 'c', totalCents: 2000 },
    ])

    expect(slices[0]?.dashOffset).toBeCloseTo(0)
    expect(slices[1]?.dashOffset).toBeCloseTo(-DONUT_CIRCUMFERENCE * 0.5)
    expect(slices[2]?.dashOffset).toBeCloseTo(-DONUT_CIRCUMFERENCE * 0.8)
  })

  it('ordena do maior para o menor mesmo se a entrada vier bagunçada', () => {
    const slices = buildDonutSlices([
      { category: 'pequena', totalCents: 100 },
      { category: 'grande', totalCents: 900 },
    ])

    expect(slices.map((s) => s.category)).toEqual(['grande', 'pequena'])
  })

  it('agrupa as menores em "outras" quando passa do máximo de fatias', () => {
    const items = Array.from({ length: MAX_SLICES + 3 }, (_, index) => ({
      category: `cat-${index}`,
      totalCents: (index + 1) * 1000,
    }))

    const slices = buildDonutSlices(items)
    expect(slices).toHaveLength(MAX_SLICES)
    const others = slices[MAX_SLICES - 1]
    expect(others?.category).toBe(OTHERS_LABEL)
    // As quatro menores (1000+2000+3000+4000) sobraram para "outras".
    expect(others?.totalCents).toBe(10000)
    expect(slices.reduce((sum, s) => sum + s.totalCents, 0)).toBe(45000)
  })

  it('cobre a circunferência inteira quando há uma única categoria', () => {
    const slices = buildDonutSlices([{ category: 'única', totalCents: 4200 }])

    expect(slices).toHaveLength(1)
    expect(slices[0]?.percent).toBe(100)
    expect(slices[0]?.dashLength).toBeCloseTo(DONUT_CIRCUMFERENCE)
  })

  it('devolve lista vazia sem despesas ou com totais não positivos', () => {
    expect(buildDonutSlices([])).toEqual([])
    expect(buildDonutSlices([{ category: 'zerada', totalCents: 0 }])).toEqual([])
  })

  it('ignora categorias zeradas sem distorcer as demais', () => {
    const slices = buildDonutSlices([
      { category: 'zerada', totalCents: 0 },
      { category: 'cheia', totalCents: 1000 },
    ])

    expect(slices.map((s) => s.category)).toEqual(['cheia'])
    expect(slices[0]?.percent).toBe(100)
  })
})

describe('formatPercent', () => {
  it('usa vírgula decimal e uma casa', () => {
    expect(formatPercent(33.333)).toBe('33,3%')
    expect(formatPercent(100)).toBe('100,0%')
  })
})
