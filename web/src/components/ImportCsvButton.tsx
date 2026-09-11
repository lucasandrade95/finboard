import { useId, type ChangeEvent } from 'react'
import { useImportTransactions } from '../hooks/use-finance'
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
        {importMutation.isPending ? 'Importando…' : 'Importar CSV'}
      </label>
      {importMutation.isSuccess && (
        <p className="import-report" role="status">
          {importMutation.data.imported === 1
            ? '1 transação importada.'
            : `${importMutation.data.imported} transações importadas.`}
        </p>
      )}
      {error instanceof CsvImportError && (
        <div className="import-report form-error" role="alert">
          <p>Nada foi importado. Corrija o arquivo e envie de novo:</p>
          <ul>
            {error.errors.map((rowError, index) => (
              <li key={index}>
                Linha {rowError.line}
                {rowError.column ? ` (${rowError.column})` : ''}: {rowError.message}
              </li>
            ))}
          </ul>
          {error.errorCount > error.errors.length && (
            <p>…e mais {error.errorCount - error.errors.length} erro(s).</p>
          )}
        </div>
      )}
      {error && !(error instanceof CsvImportError) && (
        <p className="import-report form-error" role="alert">
          Falha ao importar o arquivo. Tente de novo.
        </p>
      )}
    </>
  )
}
