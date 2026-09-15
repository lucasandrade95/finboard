// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getToken, setToken, subscribeToToken } from './auth'

afterEach(() => {
  setToken(null)
})

describe('store do token', () => {
  it('guarda o token em memória e no localStorage', () => {
    setToken('token-123')

    expect(getToken()).toBe('token-123')
    expect(localStorage.getItem('finboard.token')).toBe('token-123')
  })

  it('limpa memória e localStorage no logout', () => {
    setToken('token-123')
    setToken(null)

    expect(getToken()).toBeNull()
    expect(localStorage.getItem('finboard.token')).toBeNull()
  })

  it('avisa os inscritos a cada troca e para depois do unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToToken(listener)

    setToken('token-123')
    expect(listener).toHaveBeenCalledTimes(1)

    // Mesmo valor não é troca: evita re-render à toa em quem observa o store.
    setToken('token-123')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    setToken('outro-token')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
