import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './msw'

// Request sem handler é erro, não passa em silêncio: se o componente chamar uma
// rota que o teste não previu, o teste quebra em vez de testar a coisa errada.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  server.resetHandlers()
  server.events.removeAllListeners()
})

afterAll(() => server.close())
