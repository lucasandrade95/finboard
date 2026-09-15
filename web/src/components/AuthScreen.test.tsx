// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getToken, setToken } from '../lib/auth'
import { AuthScreen } from './AuthScreen'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  setToken(null)
})

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

function fillCredentials(password = 'senha-forte-123') {
  fireEvent.change(screen.getByLabelText('E-mail'), {
    target: { value: 'lucas@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: password } })
}

describe('AuthScreen', () => {
  it('faz login e guarda o token da sessão', async () => {
    const fetchMock = mockFetch(200, {
      user: { id: 1, email: 'lucas@example.com' },
      token: 'token-123',
    })
    render(<AuthScreen />)

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    await vi.waitFor(() => expect(getToken()).toBe('token-123'))
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/login')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1].body))).toEqual({
      email: 'lucas@example.com',
      password: 'senha-forte-123',
    })
  })

  it('mostra o erro da API e não abre sessão quando a credencial está errada', async () => {
    mockFetch(401, { error: 'invalid_credentials' })
    render(<AuthScreen />)

    fillCredentials('senha-errada-123')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('E-mail ou senha inválidos.')
    expect(getToken()).toBeNull()
    // Continua utilizável depois do erro: o botão volta de "Entrando…" para "Entrar".
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDefined()
  })

  it('alterna para o registro e cria a conta já autenticada', async () => {
    const fetchMock = mockFetch(201, {
      user: { id: 2, email: 'lucas@example.com' },
      token: 'token-novo',
    })
    render(<AuthScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'Não tem conta? Criar uma' }))
    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))

    await vi.waitFor(() => expect(getToken()).toBe('token-novo'))
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/register')
  })

  it('limpa o erro anterior ao trocar de modo', async () => {
    mockFetch(401, { error: 'invalid_credentials' })
    render(<AuthScreen />)

    fillCredentials('senha-errada-123')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await screen.findByRole('alert')

    fireEvent.click(screen.getByRole('button', { name: 'Não tem conta? Criar uma' }))

    expect(screen.queryByRole('alert')).toBeNull()
  })
})
