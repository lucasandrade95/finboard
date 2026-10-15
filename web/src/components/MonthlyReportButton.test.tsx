// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonthlyReportButton } from './MonthlyReportButton'

const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:finboard/relatorio')
const revokeObjectURL = vi.fn<(url: string) => void>()
let downloaded: { href: string; filename: string } | undefined

beforeEach(() => {
  // jsdom não implementa a API de object URL: o componente precisa dela para baixar o blob.
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
  downloaded = undefined
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

describe('MonthlyReportButton', () => {
  it('baixa o PDF do mês selecionado com o nome dado pelo server', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-disposition': 'attachment; filename="relatorio-2026-08.pdf"',
      }),
      blob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MonthlyReportButton month="2026-08" />)

    fireEvent.click(screen.getByRole('button', { name: 'Relatório PDF' }))

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/reports/monthly.pdf?month=2026-08')
    expect(downloaded).toEqual({
      href: 'blob:finboard/relatorio',
      filename: 'relatorio-2026-08.pdf',
    })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:finboard/relatorio')
  })

  it('usa o nome padrão quando o Content-Disposition não chega', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        blob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      }),
    )
    render(<MonthlyReportButton month="2026-09" />)

    fireEvent.click(screen.getByRole('button', { name: 'Relatório PDF' }))

    await waitFor(() => expect(downloaded?.filename).toBe('relatorio-2026-09.pdf'))
  })

  it('avisa quando a geração falha, sem baixar nada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }),
    )
    render(<MonthlyReportButton month="2026-08" />)

    fireEvent.click(screen.getByRole('button', { name: 'Relatório PDF' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Falha ao gerar o relatório')
    expect(createObjectURL).not.toHaveBeenCalled()
  })
})
