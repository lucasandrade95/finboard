import { useId, type ChangeEvent } from 'react'
import { useImportTransactions } from '../hooks/use-finance'
import { t } from '../i18n'
import { CsvImportError } from '../lib/api'

// Input de arquivo escondido atrás do label: o botão fica igual ao "Exportar CSV" ao lado,
// e o texto é lido no navegador e enviado como text/csv (sem multipart no server).
export function ImportCsvButton() {
  const inputId = useId()
  const importMutation = useImportTransactions()

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    // Limpa o input para que escolher o mesmo arquivo de novo (já corrigido) dispare o change.
    input.value = ''
    if (!file) {
      return
    }
    importMutation.mutate(await file.text())
  }

  const error = importMutation.error
  return (
    <>
      {/* Input antes do label: o foco por teclado no input destaca o label via CSS (`+`). */}
      <input
        id={inputId}
        className="visually-hidden"
        type="file"
        accept=".csv,text/csv"
        disabled={importMutation.isPending}
        onChange={(event) => void handleChange(event)}
      />
      <label className="import-csv" htmlFor={inputId} aria-busy={importMutation.isPending}>
        {importMutation.isPending ? t.csv.importing : t.csv.import}
      </label>
      {importMutation.isSuccess && (
        <p className="import-report" role="status">
          {t.csv.imported(importMutation.data.imported)}
        </p>
      )}
      {error instanceof CsvImportError && (
        <div className="import-report form-error" role="alert">
          <p>{t.csv.nothingImported}</p>
          <ul>
            {error.errors.map((rowError, index) => (
              <li key={index}>
                {t.csv.rowError(rowError.line, rowError.column, rowError.message)}
              </li>
            ))}
          </ul>
          {error.errorCount > error.errors.length && (
            <p>{t.csv.moreErrors(error.errorCount - error.errors.length)}</p>
          )}
        </div>
      )}
      {error && !(error instanceof CsvImportError) && (
        <p className="import-report form-error" role="alert">
          {t.csv.importError}
        </p>
      )}
    </>
  )
}
