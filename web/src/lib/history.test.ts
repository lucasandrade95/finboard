import { describe, expect, it } from 'vitest'
import { formatAuditTime, formatAuditValue } from './history'

describe('formatAuditValue', () => {
  it('mostra centavos como reais e data como dd/mm/aaaa', () => {
    expect(formatAuditValue('amountCents', 4590)).toMatch(/R\$\s45,90/)
    expect(formatAuditValue('occurredOn', '2026-10-14')).toBe('14/10/2026')
  })

  it('traduz tipo e recorrência', () => {
    expect(formatAuditValue('type', 'income')).toBe('Receita')
    expect(formatAuditValue('type', 'expense')).toBe('Despesa')
    expect(formatAuditValue('recurring', true)).toBe('sim')
    expect(formatAuditValue('recurring', false)).toBe('não')
  })

  it('mostra a conta pelo nome e cai no id quando ela não está na lista', () => {
    const lookup = (id: number) => (id === 1 ? 'Nubank' : undefined)
    expect(formatAuditValue('accountId', 1, lookup)).toBe('Nubank')
    expect(formatAuditValue('accountId', 9, lookup)).toBe('conta #9')
  })

  it('junta tags com # e usa — para valor ausente', () => {
    expect(formatAuditValue('tags', ['viagem', 'férias'])).toBe('#viagem, #férias')
    expect(formatAuditValue('description', null)).toBe('—')
  })
})

describe('formatAuditTime', () => {
  it('formata o horário UTC da API como data e hora curtas', () => {
    expect(formatAuditTime('2026-10-16T12:00:00Z')).toMatch(/^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/)
  })
})
