/**
 * Service worker do Finboard: guarda só o app shell (HTML, JS, CSS, ícone) para a
 * página abrir sem rede. A API nunca passa por aqui — as respostas dela são por
 * usuário e o Cache Storage indexa só pela URL, então um cache de `/api` mostraria
 * o resumo de uma conta para outra no mesmo navegador. O último resumo para leitura
 * offline fica no `localStorage`, apagado no logout (ver `lib/offline-summary.ts`).
 *
 * Trocar a versão descarta o cache antigo no `activate` do worker novo.
 */
const CACHE = 'finboard-shell-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return
  }
  if (request.mode === 'navigate') {
    // Rede primeiro: deploy novo chega na hora; o HTML em cache é só o plano B offline.
    event.respondWith(networkFirst(request, '/'))
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    // Nome com hash do Vite: o mesmo arquivo nunca muda de conteúdo.
    event.respondWith(cacheFirst(request))
    return
  }
  event.respondWith(networkFirst(request, request))
})

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) {
      await cache.put(cacheKey, response.clone())
    }
    return response
  } catch (error) {
    // Rota do SPA (`/?month=...`, `/#reset=...`) abre o mesmo index.html.
    const cached = await cache.match(cacheKey, { ignoreSearch: true })
    if (cached) {
      return cached
    }
    throw error
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) {
    return cached
  }
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
  }
  return response
}
