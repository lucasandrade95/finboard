// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getToken, setSession, setToken } from '../lib/auth'
import { AuthScreen } from './AuthScreen'
import { ResetPasswordScreen } from './PasswordRecovery'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  setToken(null)
})

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

function fillNewPassword(password: string, confirmation = password) {
  fireEvent.change(screen.getByLabelText('Senha nova'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirme a senha nova'), {
    target: { value: confirmation },
  })
}

describe('Esqueci minha senha', () => {
  it('abre a partir do login, pede o link e mostra a confirmação neutra', async () => {
    const fetchMock = mockFetch(202)
    render(<AuthScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }))
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'lucas@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }))

    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('Se existir uma conta com lucas@example.com')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/forgot-password')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1].body))).toEqual({
      email: 'lucas@example.com',
    })
  })

  it('volta para o login', () => {
    render(<AuthScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para o login' }))

    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeDefined()
  })

  it('só oferece a recuperação no modo de login', () => {
    render(<AuthScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'Não tem conta? Criar uma' }))

    expect(screen.queryByRole('button', { name: 'Esqueci minha senha' })).toBeNull()
  })
})

describe('ResetPasswordScreen', () => {
  it('troca a senha com o token do link e encerra a sessão desta aba', async () => {
    setSession({ token: 'token-antigo', refreshToken: 'refresh-antigo' })
    const fetchMock = mockFetch(204)
    render(<ResetPasswordScreen token="token-do-link" onDone={() => undefined} />)

    fillNewPassword('senha-nova-456')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha' }))

    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('Senha alterada')
    expect(getToken()).toBeNull()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/reset-password')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1].body))).toEqual({
      token: 'token-do-link',
      password: 'senha-nova-456',
    })
  })

  it('não chama a API quando a confirmação não confere', () => {
    const fetchMock = mockFetch(204)
    render(<ResetPasswordScreen token="token-do-link" onDone={() => undefined} />)

    fillNewPassword('senha-nova-456', 'senha-nova-457')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha' }))

    expect(screen.getByRole('alert').textContent).toBe('As senhas não conferem.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explica quando o link venceu ou já foi usado', async () => {
    mockFetch(400, { error: 'invalid_reset_token' })
    render(<ResetPasswordScreen token="token-vencido" onDone={() => undefined} />)

    fillNewPassword('senha-nova-456')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Este link é inválido, já foi usado ou venceu. Peça um novo.')
  })

  it('volta para o login pelo botão', () => {
    const onDone = vi.fn()
    render(<ResetPasswordScreen token="token-do-link" onDone={onDone} />)

    fireEvent.click(screen.getByRole('button', { name: 'Voltar para o login' }))

    expect(onDone).toHaveBeenCalledOnce()
  })
})
