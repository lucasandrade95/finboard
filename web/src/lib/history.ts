import { locale, t } from '../i18n'
import { type AuditedField, type AuditValue, formatBRL } from './api'

/** Nome da conta pelo id; `undefined` quando a conta não está (mais) na lista. */
export type AccountNameLookup = (id: number) => string | undefined

/**
 * Valor de um campo do histórico como o usuário leria na tabela: centavos viram
 * reais, data vira dd/mm/aaaa, conta vira nome. `null` é "sem valor" (—).
 */
export function formatAuditValue(
  field: AuditedField,
  value: AuditValue,
  accountName: AccountNameLookup = () => undefined,
): string {
  if (value === null) {
    return t.history.empty
  }
  switch (field) {
    case 'amountCents':
      return typeof value === 'number' ? formatBRL(value) : String(value)
    case 'type':
      return value === 'income'
        ? t.common.income
        : value === 'expense'
          ? t.common.expense
          : String(value)
    case 'occurredOn':
      return String(value).split('-').reverse().join('/')
    case 'recurring':
      return value ? t.history.yes : t.history.no
    case 'accountId':
      return typeof value === 'number'
        ? (accountName(value) ?? t.history.unknownAccount(value))
        : String(value)
    case 'tags':
      return Array.isArray(value) ? value.map((tag) => `#${tag}`).join(', ') : String(value)
    default:
      return String(value)
  }
}

/** Horário do registro (UTC na API) no fuso e no formato de quem está lendo. */
export function formatAuditTime(at: string): string {
  return new Date(at).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })
}
