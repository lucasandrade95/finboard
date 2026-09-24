import { setupServer } from 'msw/node'

/**
 * API falsa compartilhada pelos testes. Começa sem handlers: cada teste declara
 * com `server.use(...)` só as rotas que o componente deve chamar, e qualquer
 * request fora disso falha o teste (ver `setup.ts`).
 */
export const server = setupServer()

/**
 * Guarda uma cópia de cada request que chega à API falsa, na ordem, para o
 * teste conferir método, URL e corpo depois — o equivalente a
 * `fetchMock.mock.calls`, só que com o `Request` de verdade que saiu do `fetch`.
 */
export function recordRequests(): Request[] {
  const requests: Request[] = []
  server.events.on('request:start', ({ request }) => {
    requests.push(request.clone())
  })
  return requests
}

/** Caminho + query do request, sem a origem que o jsdom coloca nas URLs relativas. */
export function pathOf(request: Request): string {
  const url = new URL(request.url)
  return `${url.pathname}${url.search}`
}
