// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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

function renderList(transactions: Transaction[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionList transactions={transactions} loading={false} />
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
})
