// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  recurring: false,
  createdAt: '2026-08-20 12:00:00',
}

function renderList(
  transactions: Transaction[],
  pagination?: { page: number; total: number; onPageChange: (page: number) => void },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionList transactions={transactions} loading={false} {...pagination} />
    </QueryClientProvider>,
  )
}

function mockFetch(status: number, body?: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body ?? '')),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// fetch que nunca resolve: congela a mutação em "pending" para inspecionar os botões.
function mockPendingFetch() {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
}

function field(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement
}

function sentRequest(fetchMock: ReturnType<typeof vi.fn>): [string, RequestInit] {
  return fetchMock.mock.calls[0] as [string, RequestInit]
}

function startEditing(description = 'Mercado') {
  fireEvent.click(screen.getByRole('button', { name: `Editar ${description}` }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('TransactionList', () => {
  it('mostra data no formato brasileiro, categoria e valor com sinal pelo tipo', () => {
    renderList([
      transaction,
      {
        ...transaction,
        id: 2,
        type: 'income',
        description: 'Salário',
        amountCents: 500000,
        category: 'trabalho',
        occurredOn: '2026-08-05',
      },
    ])

    const [expenseRow, incomeRow] = screen.getAllByRole('row').slice(1) as [
      HTMLElement,
      HTMLElement,
    ]
    expect(expenseRow.textContent).toContain('20/08/2026')
    expect(expenseRow.textContent).toContain('alimentação')
    expect(expenseRow.querySelector('.amount-col.expense')?.textContent).toMatch(/^−R\$\s159,90$/)
    expect(incomeRow.textContent).toContain('05/08/2026')
    expect(incomeRow.querySelector('.amount-col.income')?.textContent).toMatch(/^\+R\$\s5\.000,00$/)
  })

  it('mostra estado vazio em vez de tabela quando não há transações', () => {
    const { container } = renderList([])

    expect(screen.getByText('Nenhuma transação neste mês.')).toBeTruthy()
    expect(container.querySelector('table')).toBeNull()
  })

  it('não chama a API quando a exclusão não é confirmada', () => {
    const fetchMock = mockFetch(204)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderList([transaction])

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Mercado' }))

    expect(confirm).toHaveBeenCalledWith('Excluir "Mercado"?')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('envia DELETE com o id da transação quando a exclusão é confirmada', async () => {
    const fetchMock = mockFetch(204)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderList([{ ...transaction, id: 42 }])

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Mercado' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = sentRequest(fetchMock)
    expect(url).toBe('/api/transactions/42')
    expect(init.method).toBe('DELETE')
  })

  it('desabilita os botões de excluir enquanto a exclusão está pendente', async () => {
    mockPendingFetch()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderList([transaction, { ...transaction, id: 2, description: 'Farmácia' }])

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Mercado' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Excluir Farmácia' })).toHaveProperty(
        'disabled',
        true,
      ),
    )
    expect(screen.getByRole('button', { name: 'Excluir Mercado' })).toHaveProperty('disabled', true)
  })

  it('anuncia a falha quando a API recusa a exclusão', async () => {
    mockFetch(500, { error: 'internal' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderList([transaction])

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Mercado' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Falha ao excluir. Tente de novo.')
    // A linha continua na tela: nada some da lista sem a API confirmar.
    expect(screen.getByText('Mercado')).toBeTruthy()
  })

  it('salva a edição com PUT, valor em centavos e campos sem espaços nas pontas', async () => {
    const fetchMock = mockFetch(200, { ...transaction, description: 'Feira' })
    renderList([transaction])

    startEditing()
    fireEvent.change(field('Descrição'), { target: { value: '  Feira  ' } })
    fireEvent.change(field('Valor (R$)'), { target: { value: '1.234,56' } })
    fireEvent.change(field('Categoria'), { target: { value: ' hortifruti ' } })
    fireEvent.change(field('Tipo'), { target: { value: 'income' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Repetir todo mês' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = sentRequest(fetchMock)
    expect(url).toBe('/api/transactions/1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({
      type: 'income',
      description: 'Feira',
      amountCents: 123456,
      category: 'hortifruti',
      occurredOn: '2026-08-20',
      recurring: true,
    })
    // Sucesso fecha a edição e devolve a linha de leitura.
    await waitFor(() => expect(screen.queryByLabelText('Descrição')).toBeNull())
  })

  it('omite a categoria em branco na edição em vez de enviar string vazia', async () => {
    const fetchMock = mockFetch(200, transaction)
    renderList([transaction])

    startEditing()
    fireEvent.change(field('Categoria'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(String(sentRequest(fetchMock)[1].body)) as Record<string, unknown>
    expect(body).not.toHaveProperty('category')
  })

  it('mostra "Salvando…" desabilitado enquanto a edição não responde', async () => {
    mockPendingFetch()
    renderList([transaction])

    startEditing()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    const saving = await screen.findByRole('button', { name: 'Salvando…' })
    expect(saving).toHaveProperty('disabled', true)
  })

  it.each([
    ['abc', 'Informe um valor válido, ex.: 159,90'],
    ['0', 'O valor precisa ser maior que zero'],
  ])('barra o valor "%s" na edição antes de chamar a API', (amount, message) => {
    const fetchMock = mockFetch(200, transaction)
    renderList([transaction])

    startEditing()
    fireEvent.change(field('Valor (R$)'), { target: { value: amount } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(screen.getByRole('alert').textContent).toBe(message)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('mantém a edição aberta com o que foi digitado quando a API falha', async () => {
    mockFetch(500, { error: 'internal' })
    renderList([transaction])

    startEditing()
    fireEvent.change(field('Descrição'), { target: { value: 'Feira' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect((await screen.findByRole('alert')).textContent).toContain('API 500')
    expect(field('Descrição').value).toBe('Feira')
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveProperty('disabled', false)
  })

  it('edita uma linha por vez: abrir outra fecha a anterior', () => {
    renderList([transaction, { ...transaction, id: 2, description: 'Farmácia' }])

    startEditing('Mercado')
    startEditing('Farmácia')

    expect(screen.getAllByLabelText('Descrição')).toHaveLength(1)
    expect(field('Descrição').value).toBe('Farmácia')
    expect(screen.getByText('Mercado')).toBeTruthy()
  })

  it('abre edição inline com valores preenchidos ao clicar em Editar', () => {
    renderList([transaction])

    fireEvent.click(screen.getByRole('button', { name: 'Editar Mercado' }))

    expect(screen.getByLabelText('Descrição')).toHaveProperty('value', 'Mercado')
    expect(screen.getByLabelText('Valor (R$)')).toHaveProperty('value', '159,90')
    expect(screen.getByLabelText('Categoria')).toHaveProperty('value', 'alimentação')
    expect(screen.getByLabelText('Data')).toHaveProperty('value', '2026-08-20')
    expect(screen.getByLabelText('Tipo')).toHaveProperty('value', 'expense')
  })

  it('marca transações recorrentes com a etiqueta mensal', () => {
    renderList([
      { ...transaction, recurring: true },
      { ...transaction, id: 2, description: 'Avulsa' },
    ])

    expect(screen.getByText('↻ mensal')).toBeTruthy()
    expect(screen.getAllByText('↻ mensal')).toHaveLength(1)
  })

  it('preenche o checkbox de recorrência na edição conforme a transação', () => {
    renderList([{ ...transaction, recurring: true }])

    fireEvent.click(screen.getByRole('button', { name: 'Editar Mercado' }))

    const checkbox = screen.getByRole('checkbox', { name: 'Repetir todo mês' }) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
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

  it('mostra skeleton de lista enquanto carrega, sem a tabela vazia', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TransactionList transactions={undefined} loading={true} />
      </QueryClientProvider>,
    )

    expect(container.querySelectorAll('.skeleton-text .skeleton-bar')).toHaveLength(6)
    expect(screen.getByText('Carregando transações…')).toBeTruthy()
    // Sem tabela e sem "nenhuma transação": carregando não é o mesmo que vazio.
    expect(container.querySelector('table')).toBeNull()
    expect(screen.queryByText('Nenhuma transação neste mês.')).toBeNull()
  })
})
