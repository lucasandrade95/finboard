// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DailyBalance } from '../lib/api'
import { BalanceLineChart } from './BalanceLineChart'

afterEach(cleanup)

function dailyBalance(balances: number[]): DailyBalance {
  return {
    month: '2026-08',
    items: balances.map((balanceCents, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, '0')}`,
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
      balanceCents,
    })),
  }
}

describe('BalanceLineChart', () => {
  it('mostra saldo final, pico e fundo do mês', () => {
    render(<BalanceLineChart data={dailyBalance([100000, 250000, 180000])} loading={false} />)

    expect(screen.getByText('Saldo no fim do mês')).toBeTruthy()
    expect(screen.getByText(/1\.800,00/)).toBeTruthy()
    expect(screen.getByText('Pico (02/08)')).toBeTruthy()
    expect(screen.getByText(/2\.500,00/)).toBeTruthy()
    expect(screen.getByText('Fundo (01/08)')).toBeTruthy()
    expect(screen.getByText(/1\.000,00/)).toBeTruthy()
  })

  it('desenha a linha e a área num SVG próprio, sem biblioteca', () => {
    const { container } = render(
      <BalanceLineChart data={dailyBalance([1000, 2000])} loading={false} />,
    )

    expect(container.querySelector('svg .line-stroke')?.getAttribute('d')).toContain('M ')
    expect(container.querySelector('svg .line-area')).toBeTruthy()
    // Marcador do último dia da série.
    expect(container.querySelectorAll('svg circle')).toHaveLength(1)
  })

  it('marca saldo final negativo com a classe de valor negativo', () => {
    const { container } = render(
      <BalanceLineChart data={dailyBalance([1000, -5000])} loading={false} />,
    )

    expect(container.querySelector('.line-summary dd.negative')).toBeTruthy()
  })

  it('mostra os dias das pontas no eixo', () => {
    render(<BalanceLineChart data={dailyBalance([1000, 2000, 3000])} loading={false} />)

    expect(screen.getByText('01/08')).toBeTruthy()
    expect(screen.getByText('03/08')).toBeTruthy()
  })

  it('avisa quando não há série para o mês', () => {
    render(<BalanceLineChart data={{ month: '2026-08', items: [] }} loading={false} />)

    expect(screen.getByText('Sem dados para este mês.')).toBeTruthy()
  })

  it('mostra estado de carregamento', () => {
    const { container } = render(<BalanceLineChart data={undefined} loading={true} />)

    expect(screen.getByText('Carregando…')).toBeTruthy()
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })
})
