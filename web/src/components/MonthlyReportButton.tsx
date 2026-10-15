import { useState } from 'react'
import { t } from '../i18n'
import { api } from '../lib/api'
import { saveBlob } from '../lib/download'

interface MonthlyReportButtonProps {
  month: string
}

/** Baixa o relatório do mês em PDF, gerado no server com os mesmos números da tela. */
export function MonthlyReportButton({ month }: MonthlyReportButtonProps) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleClick() {
    setPending(true)
    setFailed(false)
    try {
      const { blob, filename } = await api.exportMonthlyReport(month)
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
        {pending ? t.report.generating : t.report.download}
      </button>
      {failed && (
        <p className="import-report form-error" role="alert">
          {t.report.error}
        </p>
      )}
    </>
  )
}
