// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useKeyboardShortcuts } from './use-keyboard-shortcuts'

afterEach(cleanup)

describe('useKeyboardShortcuts', () => {
  it('chama o handler da tecla e impede o comportamento padrão', () => {
    const search = vi.fn()
    renderHook(() => useKeyboardShortcuts({ search }))

    const notCancelled = fireEvent.keyDown(document.body, { key: '/' })

    expect(search).toHaveBeenCalledTimes(1)
    expect(notCancelled).toBe(false)
  })

  it('deixa a tecla seguir quando a ação não tem handler', () => {
    const help = vi.fn()
    renderHook(() => useKeyboardShortcuts({ help }))

    const notCancelled = fireEvent.keyDown(document.body, { key: 'n' })

    expect(help).not.toHaveBeenCalled()
    expect(notCancelled).toBe(true)
  })

  it('ignora teclas digitadas dentro de um campo', () => {
    const newTransaction = vi.fn()
    renderHook(() => useKeyboardShortcuts({ newTransaction }))
    const input = document.createElement('input')
    document.body.appendChild(input)

    fireEvent.keyDown(input, { key: 'n' })

    expect(newTransaction).not.toHaveBeenCalled()
    input.remove()
  })

  it('usa sempre o handler mais recente sem reinstalar o listener', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ help }) => useKeyboardShortcuts({ help }), {
      initialProps: { help: first },
    })

    rerender({ help: second })
    fireEvent.keyDown(document.body, { key: '?' })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('para de escutar ao desmontar', () => {
    const help = vi.fn()
    const { unmount } = renderHook(() => useKeyboardShortcuts({ help }))

    unmount()
    fireEvent.keyDown(document.body, { key: '?' })

    expect(help).not.toHaveBeenCalled()
  })
})
