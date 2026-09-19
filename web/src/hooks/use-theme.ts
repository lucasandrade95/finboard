import { useSyncExternalStore } from 'react'
import { getTheme, subscribeToTheme, type Theme } from '../lib/theme'

/**
 * Tema em uso, re-renderizando quem usa quando ele muda — seja pelo botão ou
 * pelo SO virando o `prefers-color-scheme` com a página aberta.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeToTheme, getTheme, () => 'light')
}
