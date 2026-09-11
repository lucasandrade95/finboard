import type { TransactionRecord } from './repository.js'
import {
  createTransactionSchema,
  type CreateTransactionInput,
  type TransactionType,
} from './schemas.js'

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

export interface CsvRecord {
  /** Linha do arquivo onde o registro começa (1 = cabeçalho): campo com quebra ocupa várias. */
  line: number
  fields: string[]
}

export interface CsvRowError {
  line: number
  /** Coluna do CSV a que o erro se refere; ausente quando o problema é a linha inteira. */
  column?: string
  message: string
}

export interface ParsedTransactionsCsv {
  rows: CreateTransactionInput[]
  errors: CsvRowError[]
}

const CSV_COLUMNS = CSV_HEADER.split(';')

// Nome do campo da API → coluna do CSV, para o relatório falar a língua do arquivo.
const COLUMN_BY_FIELD: Record<string, string> = {
  occurredOn: 'data',
  type: 'tipo',
  description: 'descricao',
  category: 'categoria',
  amountCents: 'valor',
  recurring: 'recorrente',
}

/**
 * Parser RFC 4180 com ';' — o inverso de `transactionsToCsv`. Aceita CRLF ou LF, ignora o BOM
 * e linhas vazias. Lança se uma aspa abrir e o arquivo acabar antes de fechar.
 */
export function parseCsv(text: string): CsvRecord[] {
  const input = text.startsWith('﻿') ? text.slice(1) : text
  const records: CsvRecord[] = []
  let fields: string[] = []
  let field = ''
  let inQuotes = false
  let line = 1
  let recordLine = 1

  const endRecord = () => {
    fields.push(field)
    // Linha em branco (inclusive a quebra final) não é registro.
    if (fields.length > 1 || fields[0] !== '') {
      records.push({ line: recordLine, fields })
    }
    fields = []
    field = ''
  }

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (inQuotes) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        if (char === '\n') line++
        field += char
      }
    } else if (char === '"' && field === '') {
      inQuotes = true
    } else if (char === ';') {
      fields.push(field)
      field = ''
    } else if (char === '\r' && input[i + 1] === '\n') {
      // CRLF: o '\n' seguinte fecha o registro.
    } else if (char === '\n') {
      endRecord()
      line++
      recordLine = line
    } else {
      field += char
    }
  }
  if (inQuotes) {
    throw new Error(`aspas abertas na linha ${recordLine} não foram fechadas`)
  }
  endRecord()
  return records
}

/**
 * "1234,56" / "1.234,56" / "50" → centavos por aritmética inteira (sem float). Devolve
 * `undefined` se o texto não for um valor em reais bem formado.
 */
export function csvValueToCents(value: string): number | undefined {
  const match = /^(\d{1,3}(?:\.\d{3})+|\d{1,12})(?:,(\d{1,2}))?$/.exec(value.trim())
  if (!match) {
    return undefined
  }
  const reais = Number((match[1] ?? '').replace(/\./g, ''))
  const cents = Number((match[2] ?? '').padEnd(2, '0'))
  return reais * 100 + cents
}

const TYPE_BY_LABEL: Record<string, TransactionType> = { receita: 'income', despesa: 'expense' }
const RECURRING_BY_LABEL: Record<string, boolean> = { sim: true, não: false, nao: false, '': false }

/**
 * Valida o CSV linha a linha no mesmo formato do export (round-trip). Não para no primeiro
 * erro: devolve todos, com linha e coluna, para a pessoa corrigir o arquivo de uma vez.
 */
export function parseTransactionsCsv(text: string): ParsedTransactionsCsv {
  let records: CsvRecord[]
  try {
    records = parseCsv(text)
  } catch (error) {
    return { rows: [], errors: [{ line: 1, message: (error as Error).message }] }
  }

  const [header, ...dataRecords] = records
  const headerColumns = header?.fields.map((column) => column.trim().toLowerCase())
  if (!headerColumns || headerColumns.join(';') !== CSV_HEADER) {
    return {
      rows: [],
      errors: [{ line: header?.line ?? 1, message: `cabeçalho esperado: ${CSV_HEADER}` }],
    }
  }
  if (dataRecords.length === 0) {
    return { rows: [], errors: [{ line: 2, message: 'arquivo sem transações' }] }
  }

  const rows: CreateTransactionInput[] = []
  const errors: CsvRowError[] = []
  for (const { line, fields } of dataRecords) {
    if (fields.length !== CSV_COLUMNS.length) {
      errors.push({
        line,
        message: `esperadas ${CSV_COLUMNS.length} colunas, encontradas ${fields.length}`,
      })
      continue
    }
    const [occurredOn, typeLabel, description, category, value, recurringLabel] = fields.map(
      (field) => field.trim(),
    ) as [string, string, string, string, string, string]

    const rowErrors: CsvRowError[] = []
    const type = TYPE_BY_LABEL[typeLabel.toLowerCase()]
    if (!type) {
      rowErrors.push({ line, column: 'tipo', message: 'use "receita" ou "despesa"' })
    }
    const amountCents = csvValueToCents(value)
    if (amountCents === undefined) {
      rowErrors.push({ line, column: 'valor', message: 'valor esperado no formato 1234,56' })
    }
    const recurring = RECURRING_BY_LABEL[recurringLabel.toLowerCase()]
    if (recurring === undefined) {
      rowErrors.push({ line, column: 'recorrente', message: 'use "sim" ou "não"' })
    }

    // O resto (tamanhos, data, valor > 0) é a mesma regra do POST: reaproveita o schema.
    const parsed = createTransactionSchema.safeParse({
      type: type ?? 'expense',
      description,
      amountCents: amountCents ?? 1,
      category: category === '' ? undefined : category,
      occurredOn,
      recurring: recurring ?? false,
    })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '')
        rowErrors.push({ line, column: COLUMN_BY_FIELD[field] ?? field, message: issue.message })
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
    } else if (parsed.success) {
      rows.push(parsed.data)
    }
  }
  return { rows, errors }
}
