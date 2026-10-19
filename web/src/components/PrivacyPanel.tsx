import { type FormEvent, useState } from 'react'
import { t } from '../i18n'
import { api } from '../lib/api'
import { saveBlob } from '../lib/download'

/**
 * Direitos do titular (LGPD): levar os próprios dados e apagar a conta. A exclusão fica
 * atrás de dois passos — abrir o formulário e digitar a senha — e de uma confirmação,
 * porque não tem volta. Ao concluir, o token some e o `App` volta para o login sozinho.
 */
export function PrivacyPanel() {
  const [exporting, setExporting] = useState(false)
  const [exportFailed, setExportFailed] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setExportFailed(false)
    try {
      const { blob, filename } = await api.exportMyData()
      saveBlob(blob, filename)
    } catch {
      setExportFailed(true)
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!window.confirm(t.privacy.confirmDelete)) {
      return
    }
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.deleteMyAccount(password)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : t.privacy.deleteError)
      setDeleting(false)
    }
  }

  function closeDelete() {
    setDeleteOpen(false)
    setPassword('')
    setDeleteError(null)
  }

  return (
    <section className="privacy-panel card">
      <h2>{t.privacy.title}</h2>
      <p className="privacy-description">{t.privacy.description}</p>
      <div className="privacy-actions">
        <button
          type="button"
          className="export-csv"
          disabled={exporting}
          onClick={() => void handleExport()}
        >
          {exporting ? t.privacy.exporting : t.privacy.export}
        </button>
        {!deleteOpen && (
          <button type="button" className="logout" onClick={() => setDeleteOpen(true)}>
            {t.privacy.deleteOpen}
          </button>
        )}
      </div>
      {exportFailed && (
        <p className="form-error" role="alert">
          {t.privacy.exportError}
        </p>
      )}
      {deleteOpen && (
        <form className="privacy-delete" onSubmit={(event) => void handleDelete(event)}>
          <p className="privacy-warning">{t.privacy.deleteWarning}</p>
          <div className="form-grid">
            <label>
              {t.privacy.password}
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={128}
              />
            </label>
          </div>
          {deleteError && (
            <p className="form-error" role="alert">
              {deleteError}
            </p>
          )}
          <div className="privacy-actions">
            <button type="submit" className="danger" disabled={deleting}>
              {deleting ? t.privacy.deletePending : t.privacy.deleteSubmit}
            </button>
            <button type="button" className="logout" onClick={closeDelete}>
              {t.privacy.cancel}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
