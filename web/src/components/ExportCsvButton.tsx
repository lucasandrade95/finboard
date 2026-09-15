import { useState } from 'react'
import { api } from '../lib/api'

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
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      // Sem o revoke o blob fica retido na memória da aba até o reload.
      URL.revokeObjectURL(url)
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
        {pending ? 'Exportando…' : 'Exportar CSV'}
      </button>
      {failed && (
        <p className="import-report form-error" role="alert">
          Falha ao exportar o CSV. Tente de novo.
        </p>
      )}
    </>
  )
}
