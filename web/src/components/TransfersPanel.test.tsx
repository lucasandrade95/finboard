// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Account, Transfer } from '../lib/api'
import { pathOf, recordRequests, server } from '../test/msw'
import { TransfersPanel } from './TransfersPanel'

function account(overrides: Partial<Account>): Account {
  return {
    id: 1,
    name: 'Corrente',
    openingBalanceCents: 0,
    balanceCents: 0,
    createdAt: '2026-10-02 10:00:00',
    ...overrides,
  }
}

const ACCOUNTS = [account({ id: 1, name: 'Corrente' }), account({ id: 2, name: 'Poupança' })]

function transfer(overrides: Partial<Transfer>): Transfer {
  return {
    id: 1,
    fromAccountId: 1,
    toAccountId: 2,
    amountCents: 50000,
    occurredOn: '2026-10-04',
    description: 'Transferência',
    createdAt: '2026-10-04 10:00:00',
    ...overrides,
  }
}

function renderPanel(
  transfers: Transfer[] | undefined,
  accounts: Account[] | undefined = ACCOUNTS,
  loading = false,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <TransfersPanel transfers={transfers} accounts={accounts} loading={loading} />
    </QueryClientProvider>,
  )
}

function fill(fields: { amount: string; date?: string; description?: string }) {
  fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: fields.amount } })
  if (fields.date) {
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: fields.date } })
  }
  if (fields.description !== undefined) {
    fireEvent.change(screen.getByLabelText('Descrição (opcional)'), {
      target: { value: fields.description },
    })
  }
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Transferir' }))
}

function mockCreated() {
  server.use(
    http.post('/api/transfers', () => HttpResponse.json(transfer({}), { status: 201 })),
    http.get('/api/transfers', () => HttpResponse.json({ items: [] })),
  )
  return recordRequests()
}

afterEach(cleanup)

describe('TransfersPanel', () => {
  it('lista cada transferência com data, contas e valor', () => {
    renderPanel([
      transfer({ id: 3, description: 'Reserva', fromAccountId: 1, toAccountId: 2 }),
      transfer({ id: 4, fromAccountId: 2, toAccountId: null, occurredOn: '2026-10-01' }),
    ])

    expect(screen.getByText(/Reserva · Corrente → Poupança/)).toBeTruthy()
    expect(screen.getByText(/Poupança → conta removida/)).toBeTruthy()
    expect(screen.getByText('04/10/2026')).toBeTruthy()
    expect(screen.getAllByText(/500,00/)).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Desfazer Reserva de 04/10/2026' })).toBeTruthy()
  })

  it('pede duas contas antes de mostrar o formulário', () => {
    renderPanel([], [account({})])

    expect(
      screen.getByText('Cadastre ao menos duas contas para transferir entre elas.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Transferir' })).toBeNull()
  })

  it('mostra vazio e skeleton enquanto carrega', () => {
    renderPanel([])
    expect(screen.getByText('Nenhuma transferência neste mês.')).toBeTruthy()
    cleanup()

    const { container } = renderPanel(undefined, undefined, true)
    expect(screen.getByText('Carregando transferências…')).toBeTruthy()
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })

  it('envia origem, destino, centavos e data; descrição em branco fica de fora', async () => {
    const requests = mockCreated()
    renderPanel([])

    fill({ amount: '1.250,50', date: '2026-10-03' })
    submit()

    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(pathOf(requests[0]!)).toBe('/api/transfers')
    expect(requests[0]!.method).toBe('POST')
    expect(await requests[0]!.json()).toEqual({
      fromAccountId: 1,
      toAccountId: 2,
      amountCents: 125050,
      occurredOn: '2026-10-03',
    })
    await vi.waitFor(() =>
      expect((screen.getByLabelText('Valor (R$)') as HTMLInputElement).value).toBe(''),
    )
  })

  it('respeita as contas escolhidas e a descrição digitada', async () => {
    const requests = mockCreated()
    renderPanel([])

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Para'), { target: { value: '1' } })
    fill({ amount: '100', description: '  Resgate  ' })
    submit()

    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(await requests[0]!.json()).toMatchObject({
      fromAccountId: 2,
      toAccountId: 1,
      amountCents: 10000,
      description: 'Resgate',
    })
  })

  it('recusa mesma conta e valor inválido sem chamar a API', () => {
    const requests = recordRequests()
    renderPanel([])

    fireEvent.change(screen.getByLabelText('Para'), { target: { value: '1' } })
    fill({ amount: '100' })
    submit()
    expect(screen.getByRole('alert').textContent).toBe(
      'Escolha contas diferentes para origem e destino.',
    )

    fireEvent.change(screen.getByLabelText('Para'), { target: { value: '2' } })
    fill({ amount: '0' })
    submit()
    expect(screen.getByRole('alert').textContent).toBe('O valor precisa ser maior que zero')

    expect(requests).toHaveLength(0)
  })

  it('desfaz pelo id da transferência', async () => {
    server.use(
      http.delete('/api/transfers/:id', () => new HttpResponse(null, { status: 204 })),
      http.get('/api/transfers', () => HttpResponse.json({ items: [] })),
    )
    const requests = recordRequests()
    renderPanel([transfer({ id: 9 })])

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer Transferência de 04/10/2026' }))

    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(requests[0]!.method).toBe('DELETE')
    expect(pathOf(requests[0]!)).toBe('/api/transfers/9')
  })
})
