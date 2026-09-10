// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ExportCsvLink } from './ExportCsvLink'

afterEach(cleanup)

describe('ExportCsvLink', () => {
  it('aponta para o export do mês selecionado', () => {
    render(<ExportCsvLink month="2026-08" />)

    const link = screen.getByRole('link', { name: 'Exportar CSV' })
    expect(link.getAttribute('href')).toBe('/api/transactions/export.csv?month=2026-08')
  })

  it('marca o link como download para o navegador salvar o arquivo', () => {
    render(<ExportCsvLink month="2026-08" />)

    expect(screen.getByRole('link', { name: 'Exportar CSV' }).hasAttribute('download')).toBe(true)
  })
})
