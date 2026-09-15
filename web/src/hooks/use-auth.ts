import { useSyncExternalStore } from 'react'
import { getToken, subscribeToToken } from '../lib/auth'

/**
 * Token atual, re-renderizando quem usa quando ele muda (login, logout ou 401
 * vindo da API). `useSyncExternalStore` em vez de Context porque o store precisa
 * ser lido também de fora do React — o `lib/api.ts` monta o header com ele.
 */
export function useToken(): string | null {
  return useSyncExternalStore(subscribeToToken, getToken, getToken)
}
