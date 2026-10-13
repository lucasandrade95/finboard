import { useEffect, useRef } from 'react'
import { resolveShortcut, type ShortcutAction } from '../lib/shortcuts'

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>

/**
 * Escuta as teclas no `document` enquanto o componente estiver montado. Ação sem
 * handler (ex.: desligada porque a ajuda está aberta) deixa a tecla seguir o
 * fluxo normal; com handler, o `preventDefault` evita que o "/" caia digitado
 * no campo de busca logo depois de receber o foco.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  // Handlers novos a cada render não reinstalam o listener: ele lê sempre o mais recente.
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const action = resolveShortcut(event)
      const handler = action ? handlersRef.current[action] : undefined
      if (handler) {
        event.preventDefault()
        handler()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
