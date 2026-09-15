// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportCsvButton } from './ExportCsvButton'

const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:finboard/fake')
const revokeObjectURL = vi.fn<(url: string) => void>()
let downloaded: { href: string; filename: string } | undefined

beforeEach(() => {
  // jsdom não implementa a API de object URL: o componente precisa dela para baixar o blob.
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
  downloaded = undefined
  // jsdom ignora o atributo `download` e tenta navegar no click: o espião guarda o
  // que o navegador receberia e evita o "Not implemented: navigation" no log.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloaded = { href: this.href, filename: this.download }
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
})

function stubCsvResponse() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({
      'content-disposition': 'attachment; filename="transacoes-2026-08.csv"',
    }),
    blob: async () => new Blob(['data;tipo\r\n'], { type: 'text/csv' }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('ExportCsvButton', () => {
  it('busca o export do mês selecionado e dispara o download do blob', async () => {
    const fetchMock = stubCsvResponse()
    render(<ExportCsvButton month="2026-08" />)

    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }))

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/transactions/export.csv?month=2026-08')
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
    // Nome do arquivo veio do Content-Disposition, não de um palpite do front.
    expect(downloaded).toEqual({
      href: 'blob:finboard/fake',
      filename: 'transacoes-2026-08.csv',
    })
    // Sem revoke o blob ficaria retido na memória da aba até o reload.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:finboard/fake')
  })

  it('avisa quando o export falha, sem derrubar a tela', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }),
    )
    render(<ExportCsvButton month="2026-08" />)

    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Falha ao exportar')
    expect(createObjectURL).not.toHaveBeenCalled()
  })
})
