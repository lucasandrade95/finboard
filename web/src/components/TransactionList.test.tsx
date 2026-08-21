// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../lib/api'
import { TransactionList } from './TransactionList'

const transaction: Transaction = {
  id: 1,
  type: 'expense',
  description: 'Mercado',
  amountCents: 15990,
  category: 'alimentação',
  occurredOn: '2026-08-20',
  createdAt: '2026-08-20 12:00:00',
}

function renderList(
  transactions: Transaction[],
  pagination?: { page: number; total: number; onPageChange: (page: number) => void },
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionList transactions={transactions} loading={false} {...pagination} />
    </QueryClientProvider>,
  )
}

afterEach(cleanup)

describe('TransactionList', () => {
  it('abre edição inline com valores preenchidos ao clicar em Editar', () => {
    renderList([transaction])

    fireEvent.click(screen.getByRole('button', { name: 'Editar Mercado' }))

    expect(screen.getByLabelText('Descrição')).toHaveProperty('value', 'Mercado')
    expect(screen.getByLabelText('Valor (R$)')).toHaveProperty('value', '159,90')
    expect(screen.getByLabelText('Categoria')).toHaveProperty('value', 'alimentação')
    expect(screen.getByLabelText('Data')).toHaveProperty('value', '2026-08-20')
    expect(screen.getByLabelText('Tipo')).toHaveProperty('value', 'expense')
  })

  it('fecha edição sem salvar ao clicar em Cancelar', () => {
    renderList([transaction])

    fireEvent.click(screen.getByRole('button', { name: 'Editar Mercado' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByLabelText('Descrição')).toBeNull()
    expect(screen.getByText('Mercado')).toBeTruthy()
  })

  it('mostra controles de paginação e navega entre páginas', () => {
    const onPageChange = vi.fn()
    renderList([transaction], { page: 2, total: 45, onPageChange })

    expect(screen.getByText('Página 2 de 3')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(onPageChange).toHaveBeenCalledWith(1)

    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('esconde paginação quando tudo cabe em uma página', () => {
    renderList([transaction], { page: 1, total: 1, onPageChange: vi.fn() })

    expect(screen.queryByRole('navigation', { name: 'Paginação' })).toBeNull()
  })
})
