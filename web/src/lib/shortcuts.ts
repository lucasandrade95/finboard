/** Ações disparáveis por tecla única no dashboard. */
export type ShortcutAction = 'newTransaction' | 'search' | 'help'

/** Tecla → ação. A ordem também é a da lista exibida na ajuda. */
export const SHORTCUTS: ReadonlyArray<{ key: string; action: ShortcutAction }> = [
  { key: 'n', action: 'newTransaction' },
  { key: '/', action: 'search' },
  { key: '?', action: 'help' },
]

/** O mínimo de um `KeyboardEvent` que a decisão precisa — fácil de montar em teste. */
export interface ShortcutKeyEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  isComposing?: boolean
  defaultPrevented?: boolean
  target: EventTarget | null
}

/**
 * Quem está digitando num campo não pode ter o "n" da palavra "almoço" roubado:
 * dentro de input, textarea, select ou área editável nenhum atalho dispara.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') {
    return true
  }
  if (tag === 'INPUT') {
    // Checkbox e botão não recebem texto: lá a tecla pode virar atalho.
    const type = (target as HTMLInputElement).type
    return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(type)
  }
  return false
}

/**
 * Traduz uma tecla em ação, ou `null` quando não é atalho. Ctrl/Cmd/Alt ficam
 * de fora para não brigar com atalhos do navegador (Ctrl+N abre janela, Cmd+/
 * comenta no editor); Shift passa, porque é ele que produz o "?" e o "N" com
 * Caps Lock. Composição de IME (acentos, teclado japonês) também não conta.
 */
export function resolveShortcut(event: ShortcutKeyEvent): ShortcutAction | null {
  if (event.defaultPrevented || event.isComposing) {
    return null
  }
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null
  }
  if (isEditableTarget(event.target)) {
    return null
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  return SHORTCUTS.find((shortcut) => shortcut.key === key)?.action ?? null
}
