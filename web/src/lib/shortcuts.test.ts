// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isEditableTarget, resolveShortcut, type ShortcutKeyEvent } from './shortcuts'

function keyEvent(key: string, overrides: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: document.body,
    ...overrides,
  }
}

function element(html: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  return wrapper.firstElementChild as HTMLElement
}

describe('resolveShortcut', () => {
  it('mapeia n, / e ? para as ações do dashboard', () => {
    expect(resolveShortcut(keyEvent('n'))).toBe('newTransaction')
    expect(resolveShortcut(keyEvent('/'))).toBe('search')
    expect(resolveShortcut(keyEvent('?'))).toBe('help')
  })

  it('aceita N maiúsculo (Shift ou Caps Lock)', () => {
    expect(resolveShortcut(keyEvent('N'))).toBe('newTransaction')
  })

  it('ignora teclas que não são atalho', () => {
    expect(resolveShortcut(keyEvent('a'))).toBeNull()
    expect(resolveShortcut(keyEvent('Enter'))).toBeNull()
    expect(resolveShortcut(keyEvent('Escape'))).toBeNull()
  })

  it('não rouba atalhos do navegador com Ctrl, Cmd ou Alt', () => {
    expect(resolveShortcut(keyEvent('n', { ctrlKey: true }))).toBeNull()
    expect(resolveShortcut(keyEvent('/', { metaKey: true }))).toBeNull()
    expect(resolveShortcut(keyEvent('n', { altKey: true }))).toBeNull()
  })

  it('não dispara enquanto se digita num campo', () => {
    expect(resolveShortcut(keyEvent('n', { target: element('<input>') }))).toBeNull()
    expect(resolveShortcut(keyEvent('/', { target: element('<textarea></textarea>') }))).toBeNull()
  })

  it('não dispara durante composição de IME nem em evento já tratado', () => {
    expect(resolveShortcut(keyEvent('n', { isComposing: true }))).toBeNull()
    expect(resolveShortcut(keyEvent('n', { defaultPrevented: true }))).toBeNull()
  })
})

describe('isEditableTarget', () => {
  it('reconhece campos de texto, select e área editável', () => {
    expect(isEditableTarget(element('<input type="search">'))).toBe(true)
    expect(isEditableTarget(element('<input type="date">'))).toBe(true)
    expect(isEditableTarget(element('<select></select>'))).toBe(true)
    const editable = element('<div contenteditable="true"></div>')
    // jsdom não calcula isContentEditable: simula o que o navegador devolve.
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(isEditableTarget(editable)).toBe(true)
  })

  it('libera atalho em checkbox, botão e fora de elementos', () => {
    expect(isEditableTarget(element('<input type="checkbox">'))).toBe(false)
    expect(isEditableTarget(element('<button>ok</button>'))).toBe(false)
    expect(isEditableTarget(document.body)).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})
