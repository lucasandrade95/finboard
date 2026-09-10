interface ExportCsvLinkProps {
  month: string
}

// Âncora com download em vez de fetch+blob: o navegador baixa direto e usa o nome
// do Content-Disposition, sem JavaScript segurando o arquivo em memória.
export function ExportCsvLink({ month }: ExportCsvLinkProps) {
  return (
    <a className="export-csv" href={`/api/transactions/export.csv?month=${month}`} download>
      Exportar CSV
    </a>
  )
}
