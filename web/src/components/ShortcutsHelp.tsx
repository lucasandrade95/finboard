import { useEffect, useRef } from 'react'
import { t } from '../i18n'
import { SHORTCUTS } from '../lib/shortcuts'

interface ShortcutsHelpProps {
  onClose: () => void
}

/**
 * Diálogo modal com a lista de atalhos. Ao abrir, o foco vai para "Fechar" (o
 * leitor de tela anuncia o título); Esc ou clique fora fecham; ao fechar, o
 * foco volta para onde estava — sem isso quem navega por teclado cai no topo.
 */
export function ShortcutsHelp({ onClose }: ShortcutsHelpProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (previous instanceof HTMLElement) {
        previous.focus()
      }
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal shortcuts-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="shortcuts-help-title">{t.shortcuts.title}</h2>
        <dl>
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.key} className="shortcut-row">
              <dt>
                <kbd>{shortcut.key}</kbd>
              </dt>
              <dd>{t.shortcuts.actions[shortcut.action]}</dd>
            </div>
          ))}
          <div className="shortcut-row">
            <dt>
              <kbd>{t.shortcuts.escKey}</kbd>
            </dt>
            <dd>{t.shortcuts.closeHint}</dd>
          </div>
        </dl>
        <p className="shortcuts-note">{t.shortcuts.note}</p>
        <button ref={closeRef} type="button" onClick={onClose}>
          {t.shortcuts.close}
        </button>
      </div>
    </div>
  )
}
