const STORAGE_KEY = 'finboard.token'

/**
 * Store mínimo do token: uma cópia em memória (fonte da verdade para o render),
 * o espelho em `localStorage` (sobrevive ao reload) e uma lista de ouvintes para
 * o React reagir sem Context. `useSyncExternalStore` liga os três — ver
 * `hooks/use-auth.ts`.
 *
 * localStorage e não cookie httpOnly porque a API é stateless e o SPA precisa
 * montar o header `Authorization` no cliente. O custo é assumido: XSS na página
 * lê o token. A troca por cookie httpOnly + CSRF token fica para quando houver
 * um domínio próprio em produção.
 */
let token: string | null = readStoredToken()
const listeners = new Set<() => void>()

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // Safari em modo privado pode lançar ao ler storage: sem token, só a tela de login.
    return null
  }
}

export function getToken(): string | null {
  return token
}

export function setToken(next: string | null): void {
  if (token === next) {
    return
  }
  token = next
  try {
    if (next) {
      localStorage.setItem(STORAGE_KEY, next)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Falhar ao persistir não pode derrubar a sessão em memória.
  }
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeToToken(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
