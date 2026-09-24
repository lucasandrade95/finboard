// @vitest-environment jsdom
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pathOf, recordRequests, server } from './msw'

// O MSW loga cada request não previsto no console.error; aqui ele é o esperado.
function silenceUnhandledLog() {
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('API falsa dos testes (MSW)', () => {
  it('responde pelo handler do teste e grava o request com método, caminho e corpo', async () => {
    server.use(http.post('/api/goals', () => HttpResponse.json({ id: 7 }, { status: 201 })))
    const requests = recordRequests()

    const response = await fetch('/api/goals?source=teste', {
      method: 'POST',
      body: JSON.stringify({ name: 'Viagem' }),
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ id: 7 })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.method).toBe('POST')
    expect(pathOf(requests[0]!)).toBe('/api/goals?source=teste')
    expect(await requests[0]!.json()).toEqual({ name: 'Viagem' })
  })

  it('não deixa passar request para rota sem handler', async () => {
    silenceUnhandledLog()
    await expect(fetch('/api/rota-nao-prevista')).rejects.toThrow()
  })

  it('não vaza handlers de um teste para o outro', async () => {
    silenceUnhandledLog()
    // O handler de /api/goals do primeiro teste foi descartado no afterEach.
    await expect(fetch('/api/goals', { method: 'POST' })).rejects.toThrow()
  })
})
