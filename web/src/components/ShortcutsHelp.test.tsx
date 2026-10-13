// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShortcutsHelp } from './ShortcutsHelp'

afterEach(cleanup)

describe('ShortcutsHelp', () => {
  it('abre como diálogo modal nomeado e lista os atalhos', () => {
    render(<ShortcutsHelp onClose={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: 'Atalhos de teclado' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('Nova transação')).toBeDefined()
    expect(screen.getByText('Buscar transações')).toBeDefined()
    expect(screen.getByText('Mostrar esta ajuda')).toBeDefined()
    expect(screen.getByText('/')).toBeDefined()
  })

  it('leva o foco para o botão Fechar ao abrir', () => {
    render(<ShortcutsHelp onClose={vi.fn()} />)

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fechar' }))
  })

  it('fecha com Esc, com o botão e com clique fora, mas não com clique dentro', () => {
    const onClose = vi.fn()
    render(<ShortcutsHelp onClose={onClose} />)

    fireEvent.keyDown(document.body, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(3)

    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('devolve o foco para onde estava ao fechar', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const { unmount } = render(<ShortcutsHelp onClose={vi.fn()} />)
    unmount()

    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })
})
