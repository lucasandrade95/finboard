// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SummaryCards } from './SummaryCards'

afterEach(cleanup)

describe('SummaryCards', () => {
  it('mostra os três cards com valores formatados', () => {
    render(
      <SummaryCards
        summary={{ incomeCents: 500000, expenseCents: 150000, balanceCents: 350000 }}
        loading={false}
      />,
    )
    expect(screen.getByText('Receitas')).toBeTruthy()
    expect(screen.getByText('Despesas')).toBeTruthy()
    expect(screen.getByText('Saldo')).toBeTruthy()
    expect(screen.getByText(/3\.500,00/)).toBeTruthy()
  })

  it('mostra travessão enquanto carrega', () => {
    render(<SummaryCards summary={undefined} loading={true} />)
    expect(screen.getAllByText('—')).toHaveLength(3)
  })

  it('mostra variação vs mês anterior quando o comparativo existe', () => {
    render(
      <SummaryCards
        summary={{
          incomeCents: 500000,
          expenseCents: 150000,
          balanceCents: 350000,
          previous: {
            month: '2026-07',
            incomeCents: 400000,
            expenseCents: 200000,
            balanceCents: 200000,
          },
        }}
        loading={false}
      />,
    )
    const [income, expense, balance] = screen.getAllByText(/vs mês anterior/)
    // Receita subiu R$ 1.000 (bom), despesa caiu R$ 500 (bom), saldo subiu R$ 1.500 (bom).
    expect(income?.textContent).toContain('+')
    expect(income?.textContent).toContain('1.000,00')
    expect(income?.className).toContain('positive')
    expect(expense?.textContent).toContain('-')
    expect(expense?.textContent).toContain('500,00')
    expect(expense?.className).toContain('positive')
    expect(balance?.textContent).toContain('1.500,00')
    expect(balance?.className).toContain('positive')
  })

  it('marca como negativa a despesa que cresceu', () => {
    render(
      <SummaryCards
        summary={{
          incomeCents: 100000,
          expenseCents: 90000,
          balanceCents: 10000,
          previous: {
            month: '2026-07',
            incomeCents: 100000,
            expenseCents: 50000,
            balanceCents: 50000,
          },
        }}
        loading={false}
      />,
    )
    const expense = screen.getAllByText(/vs mês anterior/)[1]
    expect(expense?.textContent).toContain('+')
    expect(expense?.className).toContain('negative')
  })

  it('não mostra variação sem o comparativo', () => {
    render(
      <SummaryCards
        summary={{ incomeCents: 100, expenseCents: 0, balanceCents: 100 }}
        loading={false}
      />,
    )
    expect(screen.queryByText(/vs mês anterior/)).toBeNull()
  })
})
