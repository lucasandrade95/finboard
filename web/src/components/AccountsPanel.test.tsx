// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '../lib/api'
import { pathOf, recordRequests, server } from '../test/msw'
import { AccountsPanel } from './AccountsPanel'

function account(overrides: Partial<Account>): Account {
  return {
    id: 1,
    name: 'Conta corrente',
    openingBalanceCents: 0,
    balanceCents: 0,
    createdAt: '2026-10-02 10:00:00',
    ...overrides,
  }
}

function renderPanel(accounts: Account[] | undefined, loading = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountsPanel accounts={accounts} loading={loading} />
    </QueryClientProvider>,
  )
}

function submit(name: string, openingBalance = '') {
  fireEvent.change(screen.getByLabelText('Nome da conta'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Saldo inicial (R$)'), {
    target: { value: openingBalance },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar conta' }))
}

function mockCreated() {
  server.use(
    http.post('/api/accounts', () => HttpResponse.json(account({}), { status: 201 })),
    http.get('/api/accounts', () => HttpResponse.json({ items: [] })),
  )
  return recordRequests()
}

afterEach(cleanup)

describe('AccountsPanel', () => {
  it('lista cada conta com o saldo formatado, negativo destacado', () => {
    const { container } = renderPanel([
      account({ id: 1, name: 'Cartão', balanceCents: -32000 }),
      account({ id: 2, name: 'Corrente', balanceCents: 480000 }),
    ])

    expect(screen.getByText('Cartão')).toBeTruthy()
    expect(screen.getByText(/4\.800,00/)).toBeTruthy()
    const negatives = container.querySelectorAll('.account-balance.negative')
    expect(negatives).toHaveLength(1)
    expect(negatives[0]?.textContent).toContain('320,00')
    expect(screen.getByRole('button', { name: 'Remover conta Corrente' })).toBeTruthy()
  })

  it('avisa quando não há conta e mostra skeleton enquanto carrega', () => {
    renderPanel([])
    expect(screen.getByText('Nenhuma conta cadastrada.')).toBeTruthy()
    cleanup()

    const { container } = renderPanel(undefined, true)
    expect(screen.getByText('Carregando contas…')).toBeTruthy()
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })

  it('envia nome sem espaços e saldo inicial em centavos, aceitando negativo', async () => {
    const requests = mockCreated()
    renderPanel([])

    submit('  Cartão  ', '-1.250,50')

    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(pathOf(requests[0]!)).toBe('/api/accounts')
    expect(requests[0]!.method).toBe('POST')
    expect(await requests[0]!.json()).toEqual({ name: 'Cartão', openingBalanceCents: -125050 })
    await vi.waitFor(() =>
      expect((screen.getByLabelText('Nome da conta') as HTMLInputElement).value).toBe(''),
    )
  })

  it('saldo inicial em branco vai como zero', async () => {
    const requests = mockCreated()
    renderPanel([])

    submit('Carteira')

    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(await requests[0]!.json()).toEqual({ name: 'Carteira', openingBalanceCents: 0 })
  })

  it('recusa saldo inválido sem chamar a API', () => {
    const requests = recordRequests()
    renderPanel([])

    submit('Carteira', 'abc')

    expect(screen.getByRole('alert').textContent).toBe(
      'Informe um saldo válido, ex.: 1.500,00 ou -200,00',
    )
    expect(requests).toHaveLength(0)
  })

  it('traduz o 409 de nome repetido numa mensagem legível', async () => {
    server.use(
      http.post('/api/accounts', () =>
        HttpResponse.json({ error: 'account_exists' }, { status: 409 }),
      ),
    )
    renderPanel([account({ name: 'Corrente' })])

    submit('corrente')

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Já existe uma conta com esse nome.',
    )
  })

  it('remove pelo id da conta', async () => {
    server.use(
      http.delete('/api/accounts/:id', () => new HttpResponse(null, { status: 204 })),
      http.get('/api/accounts', () => HttpResponse.json({ items: [] })),
    )
    const requests = recordRequests()
    renderPanel([account({ id: 7, name: 'Poupança' })])

    fireEvent.click(screen.getByRole('button', { name: 'Remover conta Poupança' }))

    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(requests[0]!.method).toBe('DELETE')
    expect(pathOf(requests[0]!)).toBe('/api/accounts/7')
  })
})
