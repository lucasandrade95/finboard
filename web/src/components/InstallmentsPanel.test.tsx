// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Account, Installment } from '../lib/api'
import { pathOf, recordRequests, server } from '../test/msw'
import { InstallmentsPanel } from './InstallmentsPanel'

function installment(overrides: Partial<Installment>): Installment {
  return {
    id: 1,
    description: 'Notebook',
    totalCents: 350000,
    installmentCount: 10,
    category: 'eletrônicos',
    accountId: null,
    firstDueOn: '2026-10-15',
    lastDueOn: '2027-07-15',
    createdAt: '2026-10-07 10:00:00',
    ...overrides,
  }
}

const CARD: Account = {
  id: 7,
  name: 'Cartão',
  openingBalanceCents: 0,
  balanceCents: 0,
  createdAt: '2026-10-02 10:00:00',
}

function renderPanel(
  installments: Installment[] | undefined,
  accounts: Account[] | undefined = [],
  loading = false,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <InstallmentsPanel installments={installments} accounts={accounts} loading={loading} />
    </QueryClientProvider>,
  )
}

function fill(fields: { description?: string; total: string; count: string; date?: string }) {
  fireEvent.change(screen.getByLabelText('Descrição'), {
    target: { value: fields.description ?? 'Notebook' },
  })
  fireEvent.change(screen.getByLabelText('Valor total (R$)'), { target: { value: fields.total } })
  fireEvent.change(screen.getByLabelText('Parcelas'), { target: { value: fields.count } })
  if (fields.date) {
    fireEvent.change(screen.getByLabelText('Primeira parcela'), { target: { value: fields.date } })
  }
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Parcelar' }))
}

function mockCreated() {
  server.use(
    http.post('/api/installments', () => HttpResponse.json(installment({}), { status: 201 })),
    http.get('/api/installments', () => HttpResponse.json({ items: [] })),
  )
  return recordRequests()
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('InstallmentsPanel', () => {
  it('lista cada compra com período, categoria, parcelas e total', () => {
    renderPanel([installment({})])

    expect(screen.getByText('15/10/2026 → 15/07/2027')).toBeTruthy()
    expect(screen.getByText(/Notebook · eletrônicos/)).toBeTruthy()
    expect(screen.getByText(/10× · total R\$\s3\.500,00/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancelar parcelamento Notebook' })).toBeTruthy()
  })

  it('mostra vazio e skeleton enquanto carrega', () => {
    renderPanel([])
    expect(screen.getByText('Nenhuma compra parcelada.')).toBeTruthy()
    cleanup()

    const { container } = renderPanel(undefined, undefined, true)
    expect(screen.getByText('Carregando parcelamentos…')).toBeTruthy()
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })

  it('envia total em centavos, nº de parcelas e data; categoria e conta vazias ficam de fora', async () => {
    const requests = mockCreated()
    renderPanel([])

    fill({ description: '  Notebook  ', total: '3.500,00', count: '10', date: '2026-10-15' })
    submit()

    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(pathOf(requests[0]!)).toBe('/api/installments')
    expect(requests[0]!.method).toBe('POST')
    expect(await requests[0]!.json()).toEqual({
      description: 'Notebook',
      totalCents: 350000,
      installmentCount: 10,
      firstDueOn: '2026-10-15',
    })
    await vi.waitFor(() =>
      expect((screen.getByLabelText('Valor total (R$)') as HTMLInputElement).value).toBe(''),
    )
  })

  it('envia categoria e conta escolhidas', async () => {
    const requests = mockCreated()
    renderPanel([], [CARD])

    fill({ total: '100', count: '3' })
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'casa' } })
    fireEvent.change(screen.getByLabelText('Conta'), { target: { value: '7' } })
    submit()

    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(await requests[0]!.json()).toMatchObject({
      totalCents: 10000,
      installmentCount: 3,
      category: 'casa',
      accountId: 7,
    })
  })

  it('recusa nº de parcelas fora de 2–48 e total menor que 1 centavo por parcela', () => {
    const requests = recordRequests()
    const { container } = renderPanel([])
    // Submit direto no form: o `min`/`max` nativo do input barraria o clique antes da guarda.
    const submitForm = () => fireEvent.submit(container.querySelector('form')!)

    fill({ total: '100', count: '1' })
    submitForm()
    expect(screen.getByRole('alert').textContent).toBe('Informe de 2 a 48 parcelas.')

    fill({ total: '100', count: '49' })
    submitForm()
    expect(screen.getByRole('alert').textContent).toBe('Informe de 2 a 48 parcelas.')

    fill({ total: '0,02', count: '3' })
    submitForm()
    expect(screen.getByRole('alert').textContent).toBe(
      'O total precisa ser de ao menos R$ 0,01 por parcela.',
    )

    expect(requests).toHaveLength(0)
  })

  it('cancela pelo id só depois de confirmar', async () => {
    server.use(
      http.delete('/api/installments/:id', () => new HttpResponse(null, { status: 204 })),
      http.get('/api/installments', () => HttpResponse.json({ items: [] })),
    )
    const requests = recordRequests()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderPanel([installment({ id: 9 })])
    const button = screen.getByRole('button', { name: 'Cancelar parcelamento Notebook' })

    fireEvent.click(button)
    expect(requests).toHaveLength(0)

    fireEvent.click(button)
    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(confirm).toHaveBeenCalledWith('Cancelar "Notebook" e todas as parcelas?')
    expect(requests[0]!.method).toBe('DELETE')
    expect(pathOf(requests[0]!)).toBe('/api/installments/9')
  })
})
