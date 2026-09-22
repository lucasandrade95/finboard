// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TransactionForm } from './TransactionForm'

function renderForm(categories?: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionForm categories={categories} />
    </QueryClientProvider>,
  )
}

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// fetch que nunca resolve: congela a mutação em "pending" para inspecionar o botão.
function mockPendingFetch() {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
}

function field(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement
}

function fillForm(overrides: Partial<Record<'description' | 'amount' | 'category', string>> = {}) {
  const values = {
    description: 'Mercado',
    amount: '159,90',
    category: 'alimentação',
    ...overrides,
  }
  fireEvent.change(field('Descrição'), { target: { value: values.description } })
  fireEvent.change(field('Valor (R$)'), { target: { value: values.amount } })
  fireEvent.change(field('Categoria'), { target: { value: values.category } })
  fireEvent.change(field('Data'), { target: { value: '2026-09-22' } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
}

function postedBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('TransactionForm', () => {
  it('liga o campo de categoria ao datalist de sugestões', () => {
    const { container } = renderForm(['alimentação', 'transporte'])

    const input = screen.getByLabelText('Categoria')
    const listId = input.getAttribute('list')
    expect(listId).toBe('category-suggestions')

    const options = container.querySelectorAll(`datalist#${listId} option`)
    expect([...options].map((option) => option.getAttribute('value'))).toEqual([
      'alimentação',
      'transporte',
    ])
  })

  it('mantém o campo livre para digitar uma categoria nova', () => {
    renderForm([])

    const input = screen.getByLabelText('Categoria') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.value).toBe('')
  })

  it('oferece o checkbox de recorrência desmarcado por padrão', () => {
    renderForm([])

    const checkbox = screen.getByRole('checkbox', { name: 'Repetir todo mês' }) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  describe('envio', () => {
    it('converte o valor em centavos e envia o payload completo para a API', async () => {
      const fetchMock = mockFetch(201, { id: 1 })
      renderForm([])

      fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'income' } })
      fillForm({ description: '  Salário  ', amount: '5.250,75', category: ' trabalho ' })
      fireEvent.click(screen.getByRole('checkbox', { name: 'Repetir todo mês' }))
      submit()

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('/api/transactions')
      expect(init.method).toBe('POST')
      // Descrição e categoria vão sem espaços nas pontas; o valor nunca viaja como float.
      expect(postedBody(fetchMock)).toEqual({
        type: 'income',
        description: 'Salário',
        amountCents: 525075,
        category: 'trabalho',
        occurredOn: '2026-09-22',
        recurring: true,
      })
    })

    it('omite a categoria quando o campo fica em branco', async () => {
      const fetchMock = mockFetch(201, { id: 1 })
      renderForm([])

      fillForm({ category: '   ' })
      submit()

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      expect(postedBody(fetchMock)).not.toHaveProperty('category')
    })

    it('limpa os campos após salvar, mantendo tipo e data para o próximo lançamento', async () => {
      mockFetch(201, { id: 1 })
      renderForm([])

      fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'income' } })
      fillForm()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Repetir todo mês' }))
      submit()

      await vi.waitFor(() => expect(field('Descrição').value).toBe(''))
      expect(field('Valor (R$)').value).toBe('')
      expect(field('Categoria').value).toBe('')
      expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(false)
      expect((screen.getByLabelText('Tipo') as HTMLSelectElement).value).toBe('income')
      expect(field('Data').value).toBe('2026-09-22')
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('desabilita o botão e mostra "Salvando…" enquanto a API não responde', async () => {
      mockPendingFetch()
      renderForm([])

      fillForm()
      submit()

      const button = await screen.findByRole<HTMLButtonElement>('button', { name: 'Salvando…' })
      expect(button.disabled).toBe(true)
    })
  })

  describe('fluxo de erro', () => {
    it('rejeita valor que não é número sem chamar a API', () => {
      const fetchMock = mockFetch(201, { id: 1 })
      renderForm([])

      fillForm({ amount: 'abc' })
      submit()

      expect(screen.getByRole('alert').textContent).toBe('Informe um valor válido, ex.: 159,90')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejeita valor zero ou negativo sem chamar a API', () => {
      const fetchMock = mockFetch(201, { id: 1 })
      renderForm([])

      fillForm({ amount: '0,00' })
      submit()
      expect(screen.getByRole('alert').textContent).toBe('O valor precisa ser maior que zero')

      fireEvent.change(field('Valor (R$)'), { target: { value: '-10,00' } })
      submit()
      expect(screen.getByRole('alert').textContent).toBe('O valor precisa ser maior que zero')

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('mostra a falha da API e preserva o que foi digitado para tentar de novo', async () => {
      mockFetch(500, { error: 'internal_error' })
      renderForm([])

      fillForm({ description: 'Mercado', amount: '159,90' })
      submit()

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe('API 500: {"error":"internal_error"}')
      // Nada é apagado no erro: quem digitou não perde o lançamento.
      expect(field('Descrição').value).toBe('Mercado')
      expect(field('Valor (R$)').value).toBe('159,90')
      expect(field('Categoria').value).toBe('alimentação')
      // Volta a ficar utilizável para reenviar.
      const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Adicionar' })
      expect(button.disabled).toBe(false)
    })

    it('limpa o erro anterior ao reenviar com valor corrigido', async () => {
      const fetchMock = mockFetch(201, { id: 1 })
      renderForm([])

      fillForm({ amount: 'abc' })
      submit()
      expect(screen.getByRole('alert')).toBeTruthy()

      fireEvent.change(field('Valor (R$)'), { target: { value: '12,50' } })
      submit()

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      expect(screen.queryByRole('alert')).toBeNull()
      expect(postedBody(fetchMock).amountCents).toBe(1250)
    })
  })
})
