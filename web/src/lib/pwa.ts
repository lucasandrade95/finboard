/**
 * Registra o service worker (`public/sw.js`) só no build de produção: no dev ele
 * serviria JS velho do cache por cima do hot reload do Vite. Falha no registro
 * não derruba nada — sem worker o app só deixa de abrir offline.
 */
export function registerServiceWorker(
  nav: Pick<Navigator, 'serviceWorker'> | undefined = globalThis.navigator,
  enabled: boolean = import.meta.env.PROD,
): void {
  if (!enabled || !nav || !('serviceWorker' in nav)) {
    return
  }
  nav.serviceWorker.register('/sw.js').catch((error: unknown) => {
    console.warn('service worker não registrado', error)
  })
}
