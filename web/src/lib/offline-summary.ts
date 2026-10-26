import { locale } from '../i18n'
import type { MonthlySummary } from './api'

const STORAGE_KEY = 'finboard.lastSummary'

/**
 * Resumo como a tela recebe: o da API ou, sem conexão, o último salvo. Quando
 * `offlineSavedAt` vem preenchido os números são de antes — a UI avisa a hora.
 */
export type SummaryView = MonthlySummary & { offlineSavedAt?: string }

interface SummarySnapshot {
  month: string
  savedAt: string
  summary: MonthlySummary
}

/**
 * Leitura offline do último resumo. Fica no `localStorage`, não no cache do
 * service worker: o Cache Storage indexa por URL e ignora o `Authorization`, então
 * dois usuários no mesmo navegador veriam o resumo um do outro e nada sairia no
 * logout. Aqui é uma cópia só, apagada junto com a sessão (ver `lib/auth.ts`).
 */
export function saveSummarySnapshot(
  month: string,
  summary: MonthlySummary,
  now = new Date(),
): void {
  const snapshot: SummarySnapshot = { month, savedAt: now.toISOString(), summary }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Storage cheio ou bloqueado: perde só a leitura offline, nunca o resumo online.
  }
}

/** O resumo salvo daquele mês, ou `null` — número de outro mês na tela seria pior que nada. */
export function readSummarySnapshot(month: string): SummaryView | null {
  let snapshot: unknown
  try {
    snapshot = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
  } catch {
    return null
  }
  if (!isSnapshot(snapshot) || snapshot.month !== month) {
    return null
  }
  return { ...snapshot.summary, offlineSavedAt: snapshot.savedAt }
}

export function clearSummarySnapshot(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Sem storage não há o que apagar.
  }
}

/** Hora em que o resumo offline foi salvo, no formato de quem está lendo. */
export function formatSnapshotTime(savedAt: string): string {
  return new Date(savedAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })
}

// O storage é de quem tem a página: versão antiga ou valor mexido à mão não pode virar NaN na tela.
function isSnapshot(value: unknown): value is SummarySnapshot {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const { month, savedAt, summary } = value as Record<string, unknown>
  if (typeof month !== 'string' || typeof savedAt !== 'string') {
    return false
  }
  if (typeof summary !== 'object' || summary === null) {
    return false
  }
  const { incomeCents, expenseCents, balanceCents } = summary as Record<string, unknown>
  return [incomeCents, expenseCents, balanceCents].every(Number.isSafeInteger)
}
