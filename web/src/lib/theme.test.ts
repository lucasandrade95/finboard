// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getTheme,
  getThemePreference,
  setThemePreference,
  subscribeToTheme,
  toggleTheme,
} from './theme'

type MediaListener = () => void

/** jsdom não implementa matchMedia: o stub devolve o que o "SO" estaria pedindo. */
function stubSystemDark(dark: boolean): { fireChange: () => void } {
  const mediaListeners = new Set<MediaListener>()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: dark,
      addEventListener: (_event: string, listener: MediaListener) => mediaListeners.add(listener),
      removeEventListener: (_event: string, listener: MediaListener) =>
        mediaListeners.delete(listener),
    })),
  )
  return {
    fireChange: () => {
      for (const listener of mediaListeners) {
        listener()
      }
    },
  }
}

afterEach(() => {
  setThemePreference('system')
  vi.unstubAllGlobals()
})

describe('store do tema', () => {
  it('começa em "system" e segue o prefers-color-scheme do SO', () => {
    expect(getThemePreference()).toBe('system')

    stubSystemDark(true)
    expect(getTheme()).toBe('dark')

    stubSystemDark(false)
    expect(getTheme()).toBe('light')
  })

  it('guarda a escolha explícita no localStorage e marca o <html>', () => {
    setThemePreference('dark')

    expect(getTheme()).toBe('dark')
    expect(localStorage.getItem('finboard.theme')).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('escolha explícita ganha do SO', () => {
    stubSystemDark(true)
    setThemePreference('light')

    expect(getTheme()).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('voltar para "system" limpa o storage e o atributo, devolvendo o controle ao SO', () => {
    stubSystemDark(true)
    setThemePreference('light')
    setThemePreference('system')

    expect(localStorage.getItem('finboard.theme')).toBeNull()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(getTheme()).toBe('dark')
  })

  it('toggle inverte o tema que está na tela, inclusive o herdado do SO', () => {
    stubSystemDark(true)

    toggleTheme()
    expect(getThemePreference()).toBe('light')

    toggleTheme()
    expect(getThemePreference()).toBe('dark')
  })

  it('avisa os inscritos quando o SO troca de tema, só enquanto a preferência é "system"', () => {
    const { fireChange } = stubSystemDark(false)
    const listener = vi.fn()
    const unsubscribe = subscribeToTheme(listener)

    fireChange()
    expect(listener).toHaveBeenCalledTimes(1)

    // Com escolha explícita o SO não manda mais: mudar lá não pode virar a tela aqui.
    setThemePreference('light')
    listener.mockClear()
    fireChange()
    expect(listener).not.toHaveBeenCalled()

    unsubscribe()
  })

  it('avisa os inscritos a cada troca e para depois do unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToTheme(listener)

    setThemePreference('dark')
    expect(listener).toHaveBeenCalledTimes(1)

    // Mesma preferência não é troca: evita re-render à toa em quem observa o store.
    setThemePreference('dark')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    setThemePreference('light')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
