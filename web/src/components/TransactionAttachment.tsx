import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { useAttachment, useDeleteAttachment, useUploadAttachment } from '../hooks/use-finance'
import { t } from '../i18n'
import type { Transaction } from '../lib/api'
import { ATTACHMENT_ACCEPT, attachmentProblem, isPdf } from '../lib/attachments'

interface PreviewProps {
  transaction: Transaction
  onClose: () => void
}

/**
 * Preview em diálogo modal, no mesmo padrão da ajuda de atalhos: foco no "Fechar"
 * ao abrir, Esc ou clique fora fecham e o foco volta para o botão que abriu.
 */
function AttachmentPreview({ transaction, onClose }: PreviewProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const attachment = useAttachment(transaction.id)
  const removeAttachment = useDeleteAttachment()
  const [url, setUrl] = useState<string | null>(null)

  // URL do blob vive enquanto o diálogo está aberto: revogar libera a memória do arquivo.
  useEffect(() => {
    if (!attachment.data) {
      return
    }
    const objectUrl = URL.createObjectURL(attachment.data)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [attachment.data])

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

  function handleRemove() {
    if (window.confirm(t.attachments.confirmRemove(transaction.description))) {
      removeAttachment.mutate(transaction.id, { onSuccess: onClose })
    }
  }

  const label = t.attachments.imageAlt(transaction.description)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal attachment-preview"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{t.attachments.title(transaction.description)}</h2>
        {attachment.isPending && <p role="status">{t.attachments.loading}</p>}
        {attachment.isError && (
          <p className="form-error" role="alert">
            {t.attachments.loadError}
          </p>
        )}
        {attachment.data &&
          url &&
          (isPdf(attachment.data) ? (
            <iframe className="attachment-frame" src={url} title={label} />
          ) : (
            <img className="attachment-image" src={url} alt={label} />
          ))}
        {removeAttachment.isError && (
          <p className="form-error" role="alert">
            {t.attachments.removeError}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="delete-button"
            disabled={removeAttachment.isPending}
            onClick={handleRemove}
          >
            {t.attachments.remove}
          </button>
          <button ref={closeRef} type="button" onClick={onClose}>
            {t.attachments.close}
          </button>
        </div>
      </div>
    </div>
  )
}

interface TransactionAttachmentProps {
  transaction: Transaction
}

/** Anexar (sem comprovante) ou ver/remover (com comprovante), dentro da linha da tabela. */
export function TransactionAttachment({ transaction }: TransactionAttachmentProps) {
  const inputId = useId()
  const [error, setError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const upload = useUploadAttachment()

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    // Limpa o input para que escolher o mesmo arquivo de novo dispare o change.
    input.value = ''
    if (!file) {
      return
    }
    const problem = attachmentProblem(file)
    if (problem) {
      setError(problem === 'type' ? t.attachments.invalidType : t.attachments.tooLarge)
      return
    }
    setError(null)
    upload.mutate(
      { id: transaction.id, file },
      { onError: () => setError(t.attachments.uploadError) },
    )
  }

  return (
    <>
      {transaction.hasAttachment ? (
        <button
          type="button"
          className="edit-button"
          aria-label={t.attachments.viewLabel(transaction.description)}
          onClick={() => setPreviewOpen(true)}
        >
          {t.attachments.view}
        </button>
      ) : (
        <>
          {/* Input antes do label: o foco por teclado no input destaca o label via CSS (`+`). */}
          <input
            id={inputId}
            className="visually-hidden"
            type="file"
            accept={ATTACHMENT_ACCEPT}
            aria-label={t.attachments.attachLabel(transaction.description)}
            disabled={upload.isPending}
            onChange={handleChange}
          />
          <label className="attach-button" htmlFor={inputId} aria-busy={upload.isPending}>
            {upload.isPending ? t.attachments.uploading : t.attachments.attach}
          </label>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {previewOpen && (
        <AttachmentPreview transaction={transaction} onClose={() => setPreviewOpen(false)} />
      )}
    </>
  )
}
