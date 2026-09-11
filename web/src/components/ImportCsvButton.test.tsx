// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportCsvButton } from './ImportCsvButton'

const CSV =
  'data;tipo;descricao;categoria;valor;recorrente\n2026-08-05;despesa;Mercado;casa;10,00;não\n'

function renderButton() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ImportCsvButton />
    </QueryClientProvider>,
  )
}

// O jsdom não implementa Blob.text(): o arquivo de teste traz o método pronto.
function csvFile(content: string): File {
  const file = new File([content], 'transacoes.csv', { type: 'text/csv' })
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) })
  return file
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

function chooseFile(content: string) {
  fireEvent.change(screen.getByLabelText('Importar CSV'), {
    target: { files: [csvFile(content)] },
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ImportCsvButton', () => {
  it('envia o conteúdo do arquivo como text/csv e mostra quantas foram importadas', async () => {
    const fetchMock = mockFetch(201, { imported: 3 })
    renderButton()

    chooseFile(CSV)

    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      '3 transações importadas.',
    )
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/transactions/import')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'text/csv' })
    expect(init.body).toBe(CSV)
  })

  it('lista os erros por linha e coluna quando o arquivo é rejeitado', async () => {
    mockFetch(400, {
      error: 'invalid_csv',
      errorCount: 2,
      errors: [
        { line: 3, column: 'valor', message: 'valor esperado no formato 1234,56' },
        { line: 5, message: 'esperadas 6 colunas, encontradas 3' },
      ],
    })
    renderButton()

    chooseFile(CSV)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Nada foi importado')
    const items = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(items).toEqual([
      'Linha 3 (valor): valor esperado no formato 1234,56',
      'Linha 5: esperadas 6 colunas, encontradas 3',
    ])
    expect(screen.queryByText(/e mais/)).toBeNull()
  })

  it('avisa quantos erros ficaram fora do relatório truncado', async () => {
    mockFetch(400, {
      error: 'invalid_csv',
      errorCount: 60,
      errors: [{ line: 2, column: 'tipo', message: 'use "receita" ou "despesa"' }],
    })
    renderButton()

    chooseFile(CSV)

    expect(await screen.findByText('…e mais 59 erro(s).')).toBeTruthy()
  })

  it('mostra falha genérica quando a API cai', async () => {
    mockFetch(500, { error: 'internal_error' })
    renderButton()

    chooseFile(CSV)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Falha ao importar o arquivo. Tente de novo.',
    )
  })
})
