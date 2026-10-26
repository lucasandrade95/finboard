// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UnauthorizedError } from '../lib/api'
import { setSession, setToken } from '../lib/auth'
import { readSummarySnapshot, saveSummarySnapshot } from '../lib/offline-summary'
import { fetchSummary } from './use-finance'

const summary = { incomeCents: 500000, expenseCents: 150000, balanceCents: 350000 }

function respond(status: number, body: unknown = {}) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  setToken(null)
})

describe('fetchSummary', () => {
  it('devolve o resumo da API e guarda como o último resumo', async () => {
    setSession({ token: 'jwt', refreshToken: 'refresh' })
    vi.stubGlobal('fetch', respond(200, summary))

    await expect(fetchSummary('2026-10')).resolves.toEqual(summary)
    expect(readSummarySnapshot('2026-10')).toMatchObject(summary)
  })

  it('sem rede, mostra o último resumo salvo com a hora', async () => {
    setSession({ token: 'jwt', refreshToken: 'refresh' })
    saveSummarySnapshot('2026-10', summary, new Date('2026-10-25T14:30:00Z'))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(fetchSummary('2026-10')).resolves.toEqual({
      ...summary,
      offlineSavedAt: '2026-10-25T14:30:00.000Z',
    })
  })

  it('API fora do ar atrás do proxy (502) também cai no resumo salvo', async () => {
    setSession({ token: 'jwt', refreshToken: 'refresh' })
    saveSummarySnapshot('2026-10', summary)
    vi.stubGlobal('fetch', respond(502))

    await expect(fetchSummary('2026-10')).resolves.toMatchObject(summary)
  })

  it('sem resumo salvo daquele mês, o erro segue para a tela', async () => {
    setSession({ token: 'jwt', refreshToken: 'refresh' })
    saveSummarySnapshot('2026-09', summary)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(fetchSummary('2026-10')).rejects.toThrow('Failed to fetch')
  })

  it('sessão expirada vai para o login, nunca para o resumo salvo', async () => {
    setSession({ token: 'jwt', refreshToken: 'refresh' })
    saveSummarySnapshot('2026-10', summary)
    // Resumo e refresh tomam 401: a sessão acabou.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response('{}', { status: 401 })),
    )

    await expect(fetchSummary('2026-10')).rejects.toBeInstanceOf(UnauthorizedError)
    expect(readSummarySnapshot('2026-10')).toBeNull()
  })
})
