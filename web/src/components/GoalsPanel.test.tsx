// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Goal } from '../lib/api'
import { GoalsPanel } from './GoalsPanel'

const TODAY = '2026-09-09'

function goal(overrides: Partial<Goal>): Goal {
  return {
    id: 1,
    name: 'Viagem',
    targetCents: 500000,
    savedCents: 200000,
    deadline: null,
    createdAt: '2026-09-01 10:00:00',
    ...overrides,
  }
}

function renderPanel(goals: Goal[] | undefined, loading = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <GoalsPanel goals={goals} loading={loading} today={TODAY} />
    </QueryClientProvider>,
  )
}

afterEach(cleanup)

describe('GoalsPanel', () => {
  it('mostra guardado, alvo, percentual e barra de cada meta', () => {
    renderPanel([goal({ id: 1, name: 'Viagem' }), goal({ id: 2, name: 'Reserva', savedCents: 0 })])

    expect(screen.getByText('Viagem')).toBeTruthy()
    expect(screen.getByText('40%')).toBeTruthy()
    expect(screen.getByText('0%')).toBeTruthy()
    expect(screen.getAllByText(/2\.000,00 de/)).toHaveLength(1)

    const bar = screen.getByRole('progressbar', { name: 'Meta Viagem' })
    expect(bar.getAttribute('aria-valuenow')).toBe('40')
    const fill = bar.querySelector('.goal-bar-fill') as HTMLElement
    expect(fill.style.width).toBe('40%')
  })

  it('sugere o aporte mensal quando a meta tem prazo', () => {
    renderPanel([goal({ deadline: '2026-12-31' })])

    expect(screen.getByText(/até 31\/12\/2026/)).toBeTruthy()
    expect(screen.getByText(/Guarde R\$\s?1\.000,00 por mês \(3 meses\)/)).toBeTruthy()
  })

  it('mostra só o restante quando a meta não tem prazo', () => {
    renderPanel([goal({ deadline: null })])

    expect(screen.getByText(/^Faltam R\$\s?3\.000,00\.$/)).toBeTruthy()
    expect(screen.queryByText(/por mês/)).toBeNull()
  })

  it('marca meta alcançada, esconde o aporte e mantém o percentual real', () => {
    const { container } = renderPanel([goal({ savedCents: 600000 })])

    expect(screen.getByText('Meta alcançada.')).toBeTruthy()
    expect(screen.getByText('120%')).toBeTruthy()
    expect(container.querySelector('li.goal-item.done')).toBeTruthy()
    expect(screen.queryByLabelText(/Aporte para/)).toBeNull()
    const fill = container.querySelector('.goal-bar-fill') as HTMLElement
    expect(fill.style.width).toBe('100%')
  })

  it('sinaliza prazo vencido com o restante', () => {
    const { container } = renderPanel([goal({ deadline: '2026-09-01' })])

    expect(screen.getByText(/Prazo vencido: faltam R\$\s?3\.000,00\./)).toBeTruthy()
    expect(container.querySelector('li.goal-item.overdue')).toBeTruthy()
  })

  it('oferece campo de aporte acessível por meta em andamento', () => {
    renderPanel([goal({ name: 'Viagem' })])

    expect(screen.getByLabelText('Aporte para Viagem (R$)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeTruthy()
  })

  it('avisa quando não há meta definida', () => {
    renderPanel([])

    expect(screen.getByText('Nenhuma meta definida.')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('mostra estado de carregamento', () => {
    const { container } = renderPanel(undefined, true)

    expect(screen.getByText('Carregando…')).toBeTruthy()
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })
})
