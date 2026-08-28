import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, formatBRL, parseReaisToCents } from './api'

describe('formatBRL', () => {
  it('formata centavos como moeda brasileira', () => {
    expect(formatBRL(123456)).toMatch(/R\$\s1\.234,56/)
    expect(formatBRL(0)).toMatch(/R\$\s0,00/)
  })
})

describe('parseReaisToCents', () => {
  it('converte formato brasileiro para centavos', () => {
    expect(parseReaisToCents('159,90')).toBe(15990)
    expect(parseReaisToCents('1.234,56')).toBe(123456)
    expect(parseReaisToCents('50')).toBe(5000)
  })

  it('rejeita valor não numérico', () => {
    expect(() => parseReaisToCents('abc')).toThrow()
  })
})

describe('api.listTransactions', () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ items: [], total: 0, limit: 20, offset: 0 }),
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockClear()
  })

  it('monta a URL com mês e paginação', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await api.listTransactions('2026-08', 2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/transactions?month=2026-08&limit=20&offset=20')
  })

  it('inclui categoria codificada quando informada', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await api.listTransactions('2026-08', 1, { category: 'alimentação' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/transactions?month=2026-08&limit=20&offset=0&category=alimenta%C3%A7%C3%A3o',
    )
  })

  it('inclui o tipo quando informado', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await api.listTransactions('2026-08', 1, { type: 'income' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/transactions?month=2026-08&limit=20&offset=0&type=income',
    )
  })

  it('combina tipo e categoria na mesma URL', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await api.listTransactions('2026-08', 1, { type: 'expense', category: 'transporte' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/transactions?month=2026-08&limit=20&offset=0&type=expense&category=transporte',
    )
  })

  it('inclui a busca codificada quando informada', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await api.listTransactions('2026-08', 1, { q: 'feira & cia' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/transactions?month=2026-08&limit=20&offset=0&q=feira+%26+cia',
    )
  })

  it('omite a busca quando o termo está vazio', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await api.listTransactions('2026-08', 1, { q: '' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/transactions?month=2026-08&limit=20&offset=0')
  })
})

describe('api.listCategories', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('busca as categorias do mês e devolve só a lista', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ categories: ['alimentação', 'transporte'] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.listCategories('2026-08')).resolves.toEqual(['alimentação', 'transporte'])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/categories?month=2026-08')
  })
})
