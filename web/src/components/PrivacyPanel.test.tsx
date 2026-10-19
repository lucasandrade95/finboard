// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getToken, setSession, setToken } from '../lib/auth'
import { pathOf, recordRequests, server } from '../test/msw'
import { PrivacyPanel } from './PrivacyPanel'

const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:finboard/dados')
let downloaded: { href: string; filename: string } | undefined

beforeEach(() => {
  // jsdom não implementa a API de object URL: o componente precisa dela para baixar o blob.
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
  downloaded = undefined
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloaded = { href: this.href, filename: this.download }
  })
  setSession({ token: 'token-123', refreshToken: 'refresh-123' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  createObjectURL.mockClear()
  setToken(null)
})

function openDeleteForm(password: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Excluir minha conta' }))
  fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Excluir definitivamente' }))
}

describe('PrivacyPanel', () => {
  it('baixa o JSON com o nome que o server manda', async () => {
    server.use(
      http.get('/api/auth/me/export', () =>
        HttpResponse.json(
          { format: 'finboard-export', version: 1 },
          {
            headers: {
              'content-disposition': 'attachment; filename="finboard-meus-dados-2026-10-19.json"',
            },
          },
        ),
      ),
    )
    const requests = recordRequests()
    render(<PrivacyPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Baixar meus dados (JSON)' }))

    await vi.waitFor(() => expect(downloaded).toBeDefined())
    expect(downloaded?.filename).toBe('finboard-meus-dados-2026-10-19.json')
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer token-123')
  })

  it('avisa quando o export falha', async () => {
    server.use(
      http.get('/api/auth/me/export', () =>
        HttpResponse.json({ error: 'internal_error' }, { status: 500 }),
      ),
    )
    render(<PrivacyPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Baixar meus dados (JSON)' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Falha ao gerar o arquivo. Tente de novo.',
    )
  })

  it('exclui a conta com a senha e encerra a sessão', async () => {
    server.use(http.delete('/api/auth/me', () => new HttpResponse(null, { status: 204 })))
    const requests = recordRequests()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PrivacyPanel />)

    openDeleteForm('senha-forte-123')

    expect(confirm).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(getToken()).toBeNull())
    expect(requests[0]?.method).toBe('DELETE')
    expect(pathOf(requests[0] as Request)).toBe('/api/auth/me')
    expect(await requests[0]?.json()).toEqual({ password: 'senha-forte-123' })
  })

  it('não chama a API quando a confirmação é cancelada', () => {
    const requests = recordRequests()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<PrivacyPanel />)

    openDeleteForm('senha-forte-123')

    expect(requests).toHaveLength(0)
    expect(getToken()).toBe('token-123')
  })

  it('senha errada mostra o erro e mantém a sessão', async () => {
    server.use(
      http.delete('/api/auth/me', () =>
        HttpResponse.json({ error: 'invalid_password' }, { status: 403 }),
      ),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PrivacyPanel />)

    openDeleteForm('senha-errada')

    expect((await screen.findByRole('alert')).textContent).toBe('Senha incorreta.')
    expect(getToken()).toBe('token-123')
    expect(
      (screen.getByRole('button', { name: 'Excluir definitivamente' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('cancelar fecha o formulário e descarta a senha digitada', () => {
    render(<PrivacyPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Excluir minha conta' }))
    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByLabelText('Senha atual')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir minha conta' }))
    expect((screen.getByLabelText('Senha atual') as HTMLInputElement).value).toBe('')
  })
})
