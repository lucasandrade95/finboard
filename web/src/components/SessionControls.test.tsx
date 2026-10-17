// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getToken, setSession, setToken } from '../lib/auth'
import { pathOf, recordRequests, server } from '../test/msw'
import { SessionControls } from './SessionControls'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  setToken(null)
})

describe('SessionControls', () => {
  it('Sair revoga o refresh token deste dispositivo e encerra a sessão', async () => {
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })))
    const requests = recordRequests()
    setSession({ token: 'token-123', refreshToken: 'refresh-123' })
    render(<SessionControls />)

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))

    expect(getToken()).toBeNull()
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    expect(pathOf(requests[0] as Request)).toBe('/api/auth/logout')
    expect(await requests[0]?.json()).toEqual({ refreshToken: 'refresh-123' })
  })

  it('Sair de todos pede confirmação e encerra a sessão depois do server', async () => {
    server.use(http.post('/api/auth/logout-all', () => HttpResponse.json({ revokedSessions: 2 })))
    const requests = recordRequests()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    setSession({ token: 'token-123', refreshToken: 'refresh-123' })
    render(<SessionControls />)

    fireEvent.click(screen.getByRole('button', { name: 'Sair de todos os dispositivos' }))

    expect(confirm).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(getToken()).toBeNull())
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer token-123')
  })

  it('não chama a API quando a confirmação é cancelada', () => {
    const requests = recordRequests()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    setSession({ token: 'token-123', refreshToken: 'refresh-123' })
    render(<SessionControls />)

    fireEvent.click(screen.getByRole('button', { name: 'Sair de todos os dispositivos' }))

    expect(requests).toHaveLength(0)
    expect(getToken()).toBe('token-123')
  })

  it('mostra o erro e mantém a sessão quando o server falha', async () => {
    server.use(
      http.post('/api/auth/logout-all', () =>
        HttpResponse.json({ error: 'internal_error' }, { status: 500 }),
      ),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    setSession({ token: 'token-123', refreshToken: 'refresh-123' })
    render(<SessionControls />)

    fireEvent.click(screen.getByRole('button', { name: 'Sair de todos os dispositivos' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Não foi possível sair dos outros dispositivos. Tente de novo.')
    expect(getToken()).toBe('token-123')
    // O botão volta a ficar disponível para nova tentativa.
    expect(
      (screen.getByRole('button', { name: 'Sair de todos os dispositivos' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })
})
