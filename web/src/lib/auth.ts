const STORAGE_KEY = 'finboard.token'
const REFRESH_STORAGE_KEY = 'finboard.refreshToken'

/**
 * Store mínimo do token: uma cópia em memória (fonte da verdade para o render),
 * o espelho em `localStorage` (sobrevive ao reload) e uma lista de ouvintes para
 * o React reagir sem Context. `useSyncExternalStore` liga os três — ver
 * `hooks/use-auth.ts`.
 *
 * localStorage e não cookie httpOnly porque a API é stateless e o SPA precisa
 * montar o header `Authorization` no cliente. O custo é assumido: XSS na página
 * lê os tokens. Por isso o JWT dura 15 minutos e o refresh token é de uso único —
 * uma cópia roubada usada depois do dono derruba a sessão. A troca por cookie
 * httpOnly + CSRF token fica para quando houver um domínio próprio em produção.
 */
let token: string | null = readStored(STORAGE_KEY)
let refreshToken: string | null = readStored(REFRESH_STORAGE_KEY)
const listeners = new Set<() => void>()

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    // Safari em modo privado pode lançar ao ler storage: sem token, só a tela de login.
    return null
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value) {
      localStorage.setItem(key, value)
    } else {
      localStorage.removeItem(key)
    }
  } catch {
    // Falhar ao persistir não pode derrubar a sessão em memória.
  }
}

export function getToken(): string | null {
  return token
}

export function getRefreshToken(): string | null {
  return refreshToken
}

/**
 * Troca só o JWT de acesso. `null` é fim de sessão: o refresh token vai junto,
 * senão um 401 que manda para o login deixaria uma sessão renovável para trás.
 */
export function setToken(next: string | null): void {
  if (next === null) {
    refreshToken = null
    writeStored(REFRESH_STORAGE_KEY, null)
  }
  if (token === next) {
    return
  }
  token = next
  writeStored(STORAGE_KEY, next)
  for (const listener of listeners) {
    listener()
  }
}

/** Login, registro e cada renovação: grava o par emitido pelo server. */
export function setSession(session: { token: string; refreshToken: string }): void {
  refreshToken = session.refreshToken
  writeStored(REFRESH_STORAGE_KEY, session.refreshToken)
  setToken(session.token)
}

export function subscribeToToken(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
