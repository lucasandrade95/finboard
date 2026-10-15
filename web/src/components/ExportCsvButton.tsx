import { useState } from 'react'
import { t } from '../i18n'
import { api } from '../lib/api'
import { saveBlob } from '../lib/download'

interface ExportCsvButtonProps {
  month: string
}

/**
 * Era uma âncora com `download` apontando para a rota. Com o export autenticado
 * não dá mais: âncora não manda header `Authorization`. O arquivo é buscado por
 * fetch e o download é disparado com uma âncora temporária sobre o blob.
 */
export function ExportCsvButton({ month }: ExportCsvButtonProps) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleClick() {
    setPending(true)
    setFailed(false)
    try {
      const { blob, filename } = await api.exportTransactionsCsv(month)
      saveBlob(blob, filename)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="export-csv"
        disabled={pending}
        onClick={() => void handleClick()}
      >
        {pending ? t.csv.exporting : t.csv.export}
      </button>
      {failed && (
        <p className="import-report form-error" role="alert">
          {t.csv.exportError}
        </p>
      )}
    </>
  )
}
