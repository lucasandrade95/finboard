import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, formatBRL, parseReaisToCents, UnauthorizedError } from './api'
import { getToken, setToken } from './auth'

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

describe('api.getExpensesByCategory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('busca o total de despesas por categoria do mês', async () => {
    const payload = { items: [{ category: 'mercado', totalCents: 15990 }], totalCents: 15990 }
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => payload })
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.getExpensesByCategory('2026-08')).resolves.toEqual(payload)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/expenses-by-category?month=2026-08')
  })
})

describe('autorização das rotas de dados', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setToken(null)
  })

  function stubOk(payload: unknown) {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => payload })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('envia o Bearer do token guardado', async () => {
    const fetchMock = stubOk({ categories: [] })
    setToken('token-123')

    await api.listCategories('2026-08')

    expect(fetchMock.mock.calls[0]?.[1].headers).toMatchObject({
      Authorization: 'Bearer token-123',
    })
  })

  it('não inventa header de autorização quando não há sessão', async () => {
    const fetchMock = stubOk({ categories: [] })

    await api.listCategories('2026-08')

    expect(fetchMock.mock.calls[0]?.[1].headers).not.toHaveProperty('Authorization')
  })

  it('401 descarta a sessão guardada para a UI voltar ao login', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)
    setToken('token-expirado')

    await expect(api.getSummary('2026-08')).rejects.toBeInstanceOf(UnauthorizedError)
    expect(getToken()).toBeNull()
  })
})

describe('api.login e api.register', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setToken(null)
  })

  it('devolve a sessão em caso de sucesso', async () => {
    const session = { user: { id: 1, email: 'lucas@example.com' }, token: 'token-123' }
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => session })
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.login('lucas@example.com', 'senha-forte-123')).resolves.toEqual(session)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/login')
  })

  it('traduz 401 em mensagem de credencial e mantém a sessão atual', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)
    setToken('sessao-de-outra-aba')

    await expect(api.login('lucas@example.com', 'errada')).rejects.toThrow(
      'E-mail ou senha inválidos.',
    )
    expect(getToken()).toBe('sessao-de-outra-aba')
  })

  it('traduz 409 do registro em e-mail já usado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 409, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.register('lucas@example.com', 'senha-forte-123')).rejects.toThrow(
      'Já existe uma conta com esse e-mail.',
    )
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/register')
  })
})
