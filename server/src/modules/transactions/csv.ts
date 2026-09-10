import type { TransactionRecord } from './repository.js'

// Separador ';' e vírgula decimal: é o dialeto que o Excel pt-BR abre direto, sem assistente.
export const CSV_HEADER = 'data;tipo;descricao;categoria;valor;recorrente'

// RFC 4180: campo com separador, aspas ou quebra de linha vai entre aspas; aspas internas dobram.
function escapeCsvField(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

// Centavos → "1234,56" por aritmética inteira: formatação só na borda, sem passar por float.
export function centsToCsvValue(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`
}

export function transactionsToCsv(items: TransactionRecord[]): string {
  const lines = items.map((item) =>
    [
      item.occurredOn,
      item.type === 'income' ? 'receita' : 'despesa',
      escapeCsvField(item.description),
      escapeCsvField(item.category),
      centsToCsvValue(item.amountCents),
      item.recurring ? 'sim' : 'não',
    ].join(';'),
  )
  // CRLF conforme RFC 4180; linha final também termina em quebra.
  return [CSV_HEADER, ...lines].join('\r\n') + '\r\n'
}
