// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { setSession, setToken } from './auth'
import {
  clearSummarySnapshot,
  formatSnapshotTime,
  readSummarySnapshot,
  saveSummarySnapshot,
} from './offline-summary'

const summary = { incomeCents: 500000, expenseCents: 150000, balanceCents: 350000 }

afterEach(() => {
  clearSummarySnapshot()
  setToken(null)
})

describe('último resumo para leitura offline', () => {
  it('devolve o resumo salvo do mês com a hora em que foi salvo', () => {
    saveSummarySnapshot('2026-10', summary, new Date('2026-10-25T14:30:00Z'))

    expect(readSummarySnapshot('2026-10')).toEqual({
      ...summary,
      offlineSavedAt: '2026-10-25T14:30:00.000Z',
    })
  })

  it('guarda uma cópia só: o mês mais recente substitui o anterior', () => {
    saveSummarySnapshot('2026-09', summary)
    saveSummarySnapshot('2026-10', { ...summary, balanceCents: 1 })

    expect(readSummarySnapshot('2026-09')).toBeNull()
    expect(readSummarySnapshot('2026-10')?.balanceCents).toBe(1)
  })

  it('não mostra número de outro mês', () => {
    saveSummarySnapshot('2026-09', summary)

    expect(readSummarySnapshot('2026-10')).toBeNull()
  })

  it('ignora valor corrompido ou de formato antigo no storage', () => {
    localStorage.setItem('finboard.lastSummary', '{não é json')
    expect(readSummarySnapshot('2026-10')).toBeNull()

    localStorage.setItem(
      'finboard.lastSummary',
      JSON.stringify({ month: '2026-10', savedAt: 'x', summary: { incomeCents: '10' } }),
    )
    expect(readSummarySnapshot('2026-10')).toBeNull()

    localStorage.setItem(
      'finboard.lastSummary',
      JSON.stringify({
        month: '2026-10',
        savedAt: 'x',
        summary: { ...summary, balanceCents: 1.5 },
      }),
    )
    expect(readSummarySnapshot('2026-10')).toBeNull()
  })

  it('apaga a cópia no logout, para a próxima conta não ver o resumo da anterior', () => {
    setSession({ token: 'jwt', refreshToken: 'refresh' })
    saveSummarySnapshot('2026-10', summary)

    setToken(null)

    expect(readSummarySnapshot('2026-10')).toBeNull()
    expect(localStorage.getItem('finboard.lastSummary')).toBeNull()
  })

  it('formata a hora salva em pt-BR', () => {
    expect(formatSnapshotTime('2026-10-25T14:30:00Z')).toMatch(/25\/10\/2026/)
  })
})
