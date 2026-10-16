// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuditEntry, Transaction } from '../lib/api'
import { pathOf, recordRequests, server } from '../test/msw'
import { TransactionHistory } from './TransactionHistory'

const transaction: Transaction = {
  id: 7,
  type: 'expense',
  description: 'Farmácia',
  amountCents: 5290,
  category: 'saúde',
  occurredOn: '2026-10-14',
  recurring: false,
  accountId: 1,
  transferId: null,
  installmentId: null,
  installmentNumber: null,
  tags: [],
  hasAttachment: false,
  createdAt: '2026-10-14 12:00:00',
}

const actor = { id: 1, email: 'lucas@example.com' }

const entries: AuditEntry[] = [
  {
    id: 2,
    transactionId: 7,
    action: 'updated',
    changes: [
      { field: 'amountCents', from: 4590, to: 5290 },
      { field: 'accountId', from: null, to: 1 },
    ],
    actor,
    at: '2026-10-15T18:30:00Z',
  },
  {
    id: 1,
    transactionId: 7,
    action: 'created',
    changes: [{ field: 'description', from: null, to: 'Farmácia' }],
    actor,
    at: '2026-10-14T12:00:00Z',
  },
]

afterEach(() => {
  cleanup()
})

function useApi(historyResponse: () => Response) {
  server.use(
    http.get('/api/transactions/7/history', historyResponse),
    http.get('/api/accounts', () =>
      HttpResponse.json({
        items: [{ id: 1, name: 'Nubank', openingBalanceCents: 0, createdAt: '2026-10-01' }],
      }),
    ),
  )
}

function renderHistory() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionHistory transaction={transaction} />
    </QueryClientProvider>,
  )
}

function openHistory() {
  fireEvent.click(screen.getByRole('button', { name: 'Ver histórico de alterações de Farmácia' }))
  return screen.getByRole('dialog', { name: 'Histórico — Farmácia' })
}

describe('TransactionHistory', () => {
  it('não busca nada até o diálogo abrir', () => {
    const requests = recordRequests()
    renderHistory()
    expect(requests).toEqual([])
  })

  it('lista os registros com autor, ação e o antes → depois de cada campo', async () => {
    useApi(() => HttpResponse.json({ items: entries }))
    const requests = recordRequests()
    renderHistory()

    const dialog = openHistory()

    const items = await within(dialog).findAllByRole('listitem')
    expect(items).toHaveLength(2)
    const [updated, created] = items.map((item) => item.textContent ?? '')
    expect(updated).toContain('Editada')
    expect(updated).toContain('por lucas@example.com')
    expect(updated).toMatch(/Valor\s*R\$\s45,90 → R\$\s52,90/)
    // Conta pelo nome, assim que a lista de contas chega.
    await within(items[0]!).findByText('Nubank')
    expect(created).toContain('Criada')
    expect(created).toContain('DescriçãoFarmácia')
    expect(requests.map(pathOf)).toContain('/api/transactions/7/history')
  })

  it('mostra erro quando o histórico não carrega', async () => {
    useApi(() => HttpResponse.json({ error: 'internal_error' }, { status: 500 }))
    renderHistory()

    const dialog = openHistory()

    const alert = await within(dialog).findByRole('alert')
    expect(alert.textContent).toBe('Não foi possível carregar o histórico.')
  })

  it('fecha com Esc e devolve o foco ao botão', async () => {
    useApi(() => HttpResponse.json({ items: entries }))
    renderHistory()
    const button = screen.getByRole('button', { name: 'Ver histórico de alterações de Farmácia' })
    // O fireEvent não move o foco como o clique de verdade: o teste foca antes.
    button.focus()

    openHistory()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fechar' }))
    await screen.findAllByRole('listitem')
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(button)
  })
})
