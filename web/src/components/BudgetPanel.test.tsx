// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { BudgetProgressList } from '../lib/api'
import { BudgetPanel } from './BudgetPanel'

function renderPanel(data: BudgetProgressList | undefined, loading = false, categories?: string[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BudgetPanel data={data} loading={loading} categories={categories} />
    </QueryClientProvider>,
  )
}

afterEach(cleanup)

describe('BudgetPanel', () => {
  it('mostra gasto, limite e percentual de cada orçamento', () => {
    renderPanel({
      month: '2026-08',
      items: [
        { category: 'mercado', budgetCents: 80000, spentCents: 60000 },
        { category: 'lazer', budgetCents: 40000, spentCents: 10000 },
      ],
    })

    expect(screen.getByText('mercado')).toBeTruthy()
    expect(screen.getByText('75%')).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.getByText(/600,00 de/)).toBeTruthy()

    const bar = screen.getByRole('progressbar', { name: 'Orçamento de mercado' })
    expect(bar.getAttribute('aria-valuenow')).toBe('75')
    const fill = bar.querySelector('.budget-bar-fill') as HTMLElement
    expect(fill.style.width).toBe('75%')
  })

  it('satura a barra em 100% quando o gasto passa do limite, mas mantém o percentual real', () => {
    renderPanel({
      month: '2026-08',
      items: [{ category: 'mercado', budgetCents: 50000, spentCents: 75000 }],
    })

    expect(screen.getByText('150%')).toBeTruthy()
    const bar = screen.getByRole('progressbar', { name: 'Orçamento de mercado' })
    expect(bar.getAttribute('aria-valuenow')).toBe('150')
    const fill = bar.querySelector('.budget-bar-fill') as HTMLElement
    expect(fill.style.width).toBe('100%')
  })

  it('marca o orçamento estourado com etiqueta, valor excedido e alerta no topo', () => {
    const { container } = renderPanel({
      month: '2026-08',
      items: [
        { category: 'mercado', budgetCents: 50000, spentCents: 75000 },
        { category: 'lazer', budgetCents: 40000, spentCents: 10000 },
      ],
    })

    expect(screen.getByRole('alert').textContent).toBe('1 orçamento estourou este mês.')
    expect(screen.getByText(/Estourou em R\$\s?250,00/)).toBeTruthy()
    expect(container.querySelector('li.budget-item.over')).toBeTruthy()
    expect(container.querySelectorAll('li.budget-item.over')).toHaveLength(1)
    expect(container.querySelector('li.budget-item.ok')).toBeTruthy()
  })

  it('pluraliza o alerta quando mais de um orçamento estoura', () => {
    renderPanel({
      month: '2026-08',
      items: [
        { category: 'mercado', budgetCents: 50000, spentCents: 75000 },
        { category: 'lazer', budgetCents: 40000, spentCents: 40001 },
      ],
    })

    expect(screen.getByRole('alert').textContent).toBe('2 orçamentos estouraram este mês.')
  })

  it('sinaliza "perto do limite" a partir de 80% sem disparar alerta de estouro', () => {
    const { container } = renderPanel({
      month: '2026-08',
      items: [{ category: 'mercado', budgetCents: 50000, spentCents: 45000 }],
    })

    expect(screen.getByText('Perto do limite')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(container.querySelector('li.budget-item.warning')).toBeTruthy()
  })

  it('não mostra alerta nem etiqueta quando todos os orçamentos estão folgados', () => {
    renderPanel({
      month: '2026-08',
      items: [{ category: 'mercado', budgetCents: 80000, spentCents: 20000 }],
    })

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/Estourou/)).toBeNull()
    expect(screen.queryByText('Perto do limite')).toBeNull()
  })

  it('avisa quando não há orçamento definido', () => {
    renderPanel({ month: '2026-08', items: [] })

    expect(screen.getByText('Nenhum orçamento definido.')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('mostra estado de carregamento', () => {
    const { container } = renderPanel(undefined, true)

    expect(screen.getByText('Carregando…')).toBeTruthy()
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })

  it('sugere as categorias existentes no formulário via datalist', () => {
    const { container } = renderPanel({ month: '2026-08', items: [] }, false, [
      'mercado',
      'transporte',
    ])

    const input = screen.getByLabelText('Categoria')
    expect(input.getAttribute('list')).toBe('budget-category-suggestions')
    const options = container.querySelectorAll('datalist#budget-category-suggestions option')
    expect([...options].map((option) => option.getAttribute('value'))).toEqual([
      'mercado',
      'transporte',
    ])
  })
})
