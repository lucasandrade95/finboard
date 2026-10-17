import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, formatBRL, parseReaisToCents, UnauthorizedError } from './api'
import { getRefreshToken, getToken, setSession, setToken } from './auth'

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

  it('troca o mês pelo período customizado quando há datas', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await api.listTransactions('2026-08', 1, { from: '2026-07-20', to: '2026-08-10' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/transactions?from=2026-07-20&to=2026-08-10&limit=20&offset=0',
    )
  })

  it('manda só a ponta preenchida de um período aberto', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await api.listTransactions('2026-08', 1, { from: '2026-07-20' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/transactions?from=2026-07-20&limit=20&offset=0')
  })

  it('inclui categoria codificada quando informada', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await api.listTransactions('2026-08', 1, { category: 'alimentação' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/transactions?month=2026-08&limit=20&offset=0&category=alimenta%C3%A7%C3%A3o',
    )
  })

  it('manda sort/order só quando a ordenação não é a padrão', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await api.listTransactions('2026-08', 1, { sort: { column: 'date', direction: 'desc' } })
    await api.listTransactions('2026-08', 1, { sort: { column: 'amount', direction: 'asc' } })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/transactions?month=2026-08&limit=20&offset=0')
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/api/transactions?month=2026-08&limit=20&offset=0&sort=amount&order=asc',
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

  it('inclui a tag codificada quando informada', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await api.listTransactions('2026-08', 1, { tag: 'férias' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/transactions?month=2026-08&limit=20&offset=0&tag=f%C3%A9rias',
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

describe('renovação da sessão', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setToken(null)
  })

  const renewed = {
    user: { id: 1, email: 'lucas@example.com' },
    token: 'token-novo',
    refreshToken: 'refresh-novo',
  }

  function jsonResponse(status: number, payload: unknown) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    }
  }

  /** API falsa: o JWT antigo toma 401, o novo passa, e o /refresh responde `refreshStatus`. */
  function stubApi(refreshStatus = 200) {
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/auth/refresh') {
        return refreshStatus === 200
          ? jsonResponse(200, renewed)
          : jsonResponse(refreshStatus, { error: 'invalid_refresh_token' })
      }
      const headers = (init?.headers ?? {}) as Record<string, string>
      return headers.Authorization === 'Bearer token-novo'
        ? jsonResponse(200, { categories: ['mercado'] })
        : jsonResponse(401, { error: 'unauthorized' })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('JWT vencido: renova com o refresh token e repete o pedido', async () => {
    const fetchMock = stubApi()
    setSession({ token: 'token-velho', refreshToken: 'refresh-velho' })

    await expect(api.listCategories('2026-08')).resolves.toEqual(['mercado'])

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/categories?month=2026-08',
      '/api/auth/refresh',
      '/api/categories?month=2026-08',
    ])
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      refreshToken: 'refresh-velho',
    })
    expect(getToken()).toBe('token-novo')
    expect(getRefreshToken()).toBe('refresh-novo')
  })

  it('vários 401 ao mesmo tempo disparam um único /refresh', async () => {
    const fetchMock = stubApi()
    setSession({ token: 'token-velho', refreshToken: 'refresh-velho' })

    await Promise.all([
      api.listCategories('2026-08'),
      api.listCategories('2026-09'),
      api.listCategories('2026-10'),
    ])

    const refreshes = fetchMock.mock.calls.filter((call) => call[0] === '/api/auth/refresh')
    expect(refreshes).toHaveLength(1)
  })

  it('refresh recusado encerra a sessão e volta ao login', async () => {
    stubApi(401)
    setSession({ token: 'token-velho', refreshToken: 'refresh-roubado' })

    await expect(api.listCategories('2026-08')).rejects.toBeInstanceOf(UnauthorizedError)
    expect(getToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('falha de rede no refresh não desloga', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path === '/api/auth/refresh') {
          throw new TypeError('Failed to fetch')
        }
        return jsonResponse(401, { error: 'unauthorized' })
      }),
    )
    setSession({ token: 'token-velho', refreshToken: 'refresh-velho' })

    await expect(api.listCategories('2026-08')).rejects.toThrow('Failed to fetch')
    expect(getToken()).toBe('token-velho')
    expect(getRefreshToken()).toBe('refresh-velho')
  })
})

describe('api.logout e api.logoutAll', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setToken(null)
  })

  it('logout encerra a sessão local e revoga o refresh token no server', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchMock)
    setSession({ token: 'token-123', refreshToken: 'refresh-123' })

    await api.logout()

    expect(getToken()).toBeNull()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/logout')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1].body))).toEqual({
      refreshToken: 'refresh-123',
    })
  })

  it('logout sem rede ainda encerra a sessão local', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    setSession({ token: 'token-123', refreshToken: 'refresh-123' })

    await expect(api.logout()).resolves.toBeUndefined()
    expect(getToken()).toBeNull()
  })

  it('logoutAll chama a rota autenticada e só então encerra a sessão local', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ revokedSessions: 3 }),
    })
    vi.stubGlobal('fetch', fetchMock)
    setSession({ token: 'token-123', refreshToken: 'refresh-123' })

    await expect(api.logoutAll()).resolves.toBe(3)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/logout-all')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer token-123' },
    })
    expect(getToken()).toBeNull()
  })

  it('logoutAll com falha no server mantém a sessão para tentar de novo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'erro' }),
    )
    setSession({ token: 'token-123', refreshToken: 'refresh-123' })

    await expect(api.logoutAll()).rejects.toThrow('API 500')
    expect(getToken()).toBe('token-123')
  })
})

describe('api.login e api.register', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setToken(null)
  })

  it('devolve a sessão em caso de sucesso', async () => {
    const session = {
      user: { id: 1, email: 'lucas@example.com' },
      token: 'token-123',
      refreshToken: 'refresh-123',
    }
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

describe('api.getExpensesByCategory', () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ items: [], totalCents: 0 }),
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockClear()
  })

  it('consulta pelo mês sem período', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await api.getExpensesByCategory('2026-08')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/expenses-by-category?month=2026-08')
  })

  it('consulta pelo período quando há datas', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await api.getExpensesByCategory('2026-08', { from: '2026-08-01', to: '2026-08-15' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/expenses-by-category?from=2026-08-01&to=2026-08-15',
    )
  })
})
