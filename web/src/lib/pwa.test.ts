import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './pwa'

function fakeNavigator(register = vi.fn().mockResolvedValue({})) {
  return { serviceWorker: { register } } as unknown as Pick<Navigator, 'serviceWorker'>
}

describe('registerServiceWorker', () => {
  it('registra o /sw.js no build de produção', () => {
    const nav = fakeNavigator()

    registerServiceWorker(nav, true)

    expect(nav.serviceWorker.register).toHaveBeenCalledWith('/sw.js')
  })

  it('não registra no dev, para o cache não brigar com o hot reload', () => {
    const nav = fakeNavigator()

    registerServiceWorker(nav, false)

    expect(nav.serviceWorker.register).not.toHaveBeenCalled()
  })

  it('navegador sem service worker segue normal', () => {
    expect(() => registerServiceWorker({} as Pick<Navigator, 'serviceWorker'>, true)).not.toThrow()
    expect(() => registerServiceWorker(undefined, true)).not.toThrow()
  })

  it('falha no registro só vira aviso no console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const nav = fakeNavigator(vi.fn().mockRejectedValue(new Error('SecurityError')))

    registerServiceWorker(nav, true)
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())

    warn.mockRestore()
  })
})
