// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { YearlySummary } from '../lib/api'
import { YearlyBarsChart } from './YearlyBarsChart'

afterEach(cleanup)

function yearlySummary(totals: Array<[income: number, expense: number]>): YearlySummary {
  const items = Array.from({ length: 12 }, (_, index) => {
    const [incomeCents, expenseCents] = totals[index] ?? [0, 0]
    return {
      month: `2026-${String(index + 1).padStart(2, '0')}`,
      incomeCents,
      expenseCents,
      netCents: incomeCents - expenseCents,
    }
  })
  const incomeCents = items.reduce((sum, item) => sum + item.incomeCents, 0)
  const expenseCents = items.reduce((sum, item) => sum + item.expenseCents, 0)
  return { year: '2026', items, incomeCents, expenseCents, netCents: incomeCents - expenseCents }
}

describe('YearlyBarsChart', () => {
  it('desenha duas barras por mês num SVG próprio, com os 12 meses no eixo', () => {
    const { container } = render(
      <YearlyBarsChart year="2026" data={yearlySummary([[500000, 200000]])} loading={false} />,
    )

    expect(screen.getByRole('heading', { name: 'Receitas × despesas em 2026' })).toBeTruthy()
    expect(container.querySelectorAll('svg rect.bar-income')).toHaveLength(12)
    expect(container.querySelectorAll('svg rect.bar-expense')).toHaveLength(12)
    const axis = container.querySelector('.bars-axis')
    expect(axis?.children).toHaveLength(12)
    expect(axis?.textContent).toContain('jan')
    expect(axis?.textContent).toContain('dez')
  })

  it('mostra resultado do ano, mês de maior despesa e melhor mês', () => {
    const { container } = render(
      <YearlyBarsChart
        year="2026"
        data={yearlySummary([
          [500000, 200000],
          [100000, 350000],
        ])}
        loading={false}
      />,
    )

    const values = Array.from(
      container.querySelectorAll('.line-summary dd'),
      (dd) => dd.textContent,
    )
    expect(screen.getByText('Resultado do ano')).toBeTruthy()
    expect(screen.getByText('Maior despesa (fev)')).toBeTruthy()
    expect(screen.getByText('Melhor mês (jan)')).toBeTruthy()
    // 6.000 − 5.500 no ano; 3.500 de despesa em fevereiro; 3.000 de resultado em janeiro.
    expect(values[0]).toMatch(/^R\$\s500,00$/)
    expect(values[1]).toMatch(/3\.500,00$/)
    expect(values[2]).toMatch(/3\.000,00$/)
  })

  it('marca resultado anual negativo com a classe de valor negativo', () => {
    const { container } = render(
      <YearlyBarsChart year="2026" data={yearlySummary([[1000, 5000]])} loading={false} />,
    )

    expect(container.querySelector('.line-summary dd.negative')).toBeTruthy()
  })

  it('expõe os valores de cada mês numa tabela para leitor de tela', () => {
    render(<YearlyBarsChart year="2026" data={yearlySummary([[123400, 5600]])} loading={false} />)

    const table = screen.getByRole('table', { name: 'Receitas × despesas em 2026' })
    const rows = within(table).getAllByRole('row')
    // Cabeçalho + 12 meses.
    expect(rows).toHaveLength(13)
    expect(rows[1]?.textContent).toMatch(/jan.*1\.234,00.*56,00/)
  })

  it('avisa quando o ano não tem lançamentos', () => {
    render(<YearlyBarsChart year="2026" data={yearlySummary([])} loading={false} />)

    expect(screen.getByText('Sem lançamentos neste ano.')).toBeTruthy()
  })

  it('mostra skeleton na altura do gráfico enquanto carrega', () => {
    const { container } = render(<YearlyBarsChart year="2026" data={undefined} loading={true} />)

    expect(container.querySelector('.skeleton-chart')).toBeTruthy()
    expect(screen.getByText('Carregando gráfico anual…')).toBeTruthy()
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })
})
