/**
 * Dispara o download de um blob com uma âncora temporária. O revoke logo depois do
 * click é seguro: o navegador já capturou a URL, e sem ele o blob fica retido na
 * memória da aba até o reload.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
