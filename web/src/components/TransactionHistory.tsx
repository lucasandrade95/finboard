import { useEffect, useId, useRef, useState } from 'react'
import { useAccounts, useTransactionHistory } from '../hooks/use-finance'
import { t } from '../i18n'
import type { Transaction } from '../lib/api'
import { formatAuditTime, formatAuditValue } from '../lib/history'

interface HistoryDialogProps {
  transaction: Transaction
  onClose: () => void
}

/** Mesmo padrão de diálogo do comprovante: foco no "Fechar", Esc ou clique fora fecham. */
function HistoryDialog({ transaction, onClose }: HistoryDialogProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const history = useTransactionHistory(transaction.id)
  // Conta aparece pelo nome; se a lista falhar, cai no "conta #id" do formatador.
  const accounts = useAccounts()
  const accountName = (id: number) => accounts.data?.find((account) => account.id === id)?.name

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
        className="modal transaction-history"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{t.history.title(transaction.description)}</h2>
        {history.isPending && <p role="status">{t.history.loading}</p>}
        {history.isError && (
          <p className="form-error" role="alert">
            {t.history.loadError}
          </p>
        )}
        {history.data && (
          <ol className="history-list">
            {history.data.map((entry) => (
              <li key={entry.id} className="history-entry">
                <p>
                  <strong>{t.history.actions[entry.action]}</strong>{' '}
                  <span className="history-meta">
                    {t.history.by(entry.actor.email, formatAuditTime(entry.at))}
                  </span>
                </p>
                <dl className="history-changes">
                  {entry.changes.map((change) => (
                    <div key={change.field}>
                      <dt>{t.history.fields[change.field]}</dt>
                      <dd>
                        {entry.action === 'updated' ? (
                          <>
                            <del>{formatAuditValue(change.field, change.from, accountName)}</del>
                            {' → '}
                            <ins>{formatAuditValue(change.field, change.to, accountName)}</ins>
                          </>
                        ) : (
                          // Criação e exclusão têm um lado só: o valor que existia.
                          formatAuditValue(
                            change.field,
                            entry.action === 'created' ? change.to : change.from,
                            accountName,
                          )
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        )}
        <div className="modal-actions">
          <button ref={closeRef} type="button" onClick={onClose}>
            {t.history.close}
          </button>
        </div>
      </div>
    </div>
  )
}

interface TransactionHistoryProps {
  transaction: Transaction
}

/** Botão da linha da tabela que abre o histórico de alterações (quem, quando, o quê). */
export function TransactionHistory({ transaction }: TransactionHistoryProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="edit-button"
        aria-label={t.history.openLabel(transaction.description)}
        onClick={() => setOpen(true)}
      >
        {t.history.open}
      </button>
      {open && <HistoryDialog transaction={transaction} onClose={() => setOpen(false)} />}
    </>
  )
}
