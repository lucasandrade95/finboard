import type { TransactionType } from './schemas.js'

export type AuditAction = 'created' | 'updated' | 'deleted'

/** Campos que o usuário controla: ids de vínculo e marca de comprovante ficam de fora. */
export const AUDITED_FIELDS = [
  'type',
  'description',
  'amountCents',
  'category',
  'occurredOn',
  'recurring',
  'accountId',
  'tags',
] as const

export type AuditedField = (typeof AUDITED_FIELDS)[number]

export interface AuditedSnapshot {
  type: TransactionType
  description: string
  amountCents: number
  category: string
  occurredOn: string
  recurring: boolean
  accountId: number | null
  tags: string[]
}

export type AuditValue = AuditedSnapshot[AuditedField] | null

export interface FieldChange {
  field: AuditedField
  from: AuditValue
  to: AuditValue
}

export interface AuditEntry {
  id: number
  transactionId: number
  action: AuditAction
  changes: FieldChange[]
  /** Quem fez a alteração: hoje é sempre o dono, já que ninguém mexe na conta de outro. */
  actor: { id: number; email: string }
  /** UTC em ISO 8601 com `Z`: o navegador converte para o fuso de quem lê. */
  at: string
}

// Lista vazia e ausência dizem o mesmo ("sem tags"): criar sem tags não vira uma mudança.
function normalize(value: AuditValue | undefined): AuditValue {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    return null
  }
  return value
}

function sameValue(a: AuditValue, b: AuditValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * O que mudou entre dois estados da transação, campo a campo. Sem `before` é uma
 * criação (tudo sai de `null`); sem `after`, uma exclusão (tudo vai para `null`).
 * Dinheiro continua em centavos: quem exibe formata.
 */
export function diffTransactions(
  before: AuditedSnapshot | undefined,
  after: AuditedSnapshot | undefined,
): FieldChange[] {
  const changes: FieldChange[] = []
  for (const field of AUDITED_FIELDS) {
    const from = normalize(before?.[field])
    const to = normalize(after?.[field])
    if (!sameValue(from, to)) {
      changes.push({ field, from, to })
    }
  }
  return changes
}
