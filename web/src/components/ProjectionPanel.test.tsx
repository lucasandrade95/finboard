// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { BalanceProjection, ProjectionEvent } from '../lib/api'
import { ProjectionPanel } from './ProjectionPanel'

afterEach(cleanup)

function event(overrides: Partial<ProjectionEvent> = {}): ProjectionEvent {
  return {
    date: '2026-10-20',
    type: 'expense',
    description: 'Aluguel',
    category: 'moradia',
    amountCents: 200000,
    source: 'recurring',
    ...overrides,
  }
}

function projection(overrides: Partial<BalanceProjection> = {}): BalanceProjection {
  return {
    from: '2026-10-08',
    to: '2026-11-07',
    startingBalanceCents: 470000,
    endingBalanceCents: 270000,
    lowestBalanceCents: 270000,
    lowestBalanceOn: '2026-10-20',
    events: [event()],
    items: [
      {
        date: '2026-10-20',
        incomeCents: 0,
        expenseCents: 200000,
        netCents: -200000,
        balanceCents: 270000,
      },
    ],
    ...overrides,
  }
}

describe('ProjectionPanel', () => {
  it('mostra saldo de hoje, saldo previsto no fim do horizonte e o menor saldo', () => {
    render(<ProjectionPanel data={projection()} loading={false} />)

    expect(screen.getByText('Saldo hoje')).toBeTruthy()
    expect(screen.getByText(/4\.700,00/)).toBeTruthy()
    expect(screen.getByText('Previsto em 07/11')).toBeTruthy()
    expect(screen.getByText('Menor saldo (20/10)')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lista os próximos lançamentos com data, origem e valor com sinal', () => {
    render(
      <ProjectionPanel
        data={projection({
          events: [
            event({ date: '2026-10-25', description: 'Notebook (2/3)', source: 'installment' }),
            event({
              date: '2026-11-05',
              type: 'income',
              description: 'Salário',
              amountCents: 500000,
            }),
          ],
        })}
        loading={false}
      />,
    )

    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toContain('25/10')
    expect(items[0]?.textContent).toContain('Notebook (2/3)')
    expect(items[0]?.textContent).toContain('▦ parcela')
    expect(items[0]?.querySelector('.negative')?.textContent).toMatch(/-.*2\.000,00/)
    expect(items[1]?.textContent).toContain('↻ recorrente')
    expect(items[1]?.querySelector('.positive')?.textContent).toMatch(/5\.000,00/)
  })

  it('avisa quando o saldo previsto fica negativo', () => {
    render(
      <ProjectionPanel
        data={projection({ lowestBalanceCents: -50000, lowestBalanceOn: '2026-10-12' })}
        loading={false}
      />,
    )

    expect(screen.getByRole('alert').textContent).toMatch(/negativo em 12\/10.*500,00/)
  })

  it('resume o que passa do limite da lista', () => {
    const events = Array.from({ length: 8 }, (_, index) =>
      event({ date: `2026-10-${String(10 + index)}`, description: `Conta ${index + 1}` }),
    )
    render(<ProjectionPanel data={projection({ events })} loading={false} />)

    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByText('e mais 2 lançamentos previstos.')).toBeTruthy()
  })

  it('avisa quando não há nada previsto', () => {
    render(<ProjectionPanel data={projection({ events: [], items: [] })} loading={false} />)

    expect(screen.getByText(/Nada previsto nos próximos 30 dias/)).toBeTruthy()
  })

  it('mostra o esqueleto enquanto carrega', () => {
    const { container } = render(<ProjectionPanel data={undefined} loading />)

    expect(container.querySelector('section')?.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByText('Carregando projeção de saldo…')).toBeTruthy()
  })
})
