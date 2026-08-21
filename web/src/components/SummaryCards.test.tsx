// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SummaryCards } from './SummaryCards'

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
})
