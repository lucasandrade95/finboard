export type TransactionType = 'income' | 'expense'

export interface Transaction {
  id: number
  type: TransactionType
  description: string
  amountCents: number
  category: string
  occurredOn: string
  createdAt: string
}

export interface MonthlySummary {
  incomeCents: number
  expenseCents: number
  balanceCents: number
}

export interface CreateTransactionInput {
  type: TransactionType
  description: string
  amountCents: number
  category?: string
  occurredOn: string
}

const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(cents: number): string {
  return brlFormatter.format(cents / 100)
}

export function parseReaisToCents(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.')
  const reais = Number(normalized)
  if (!Number.isFinite(reais)) {
    throw new Error(`valor monetário inválido: ${value}`)
  }
  return Math.round(reais * 100)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

export const api = {
  listTransactions: (month: string) => request<Transaction[]>(`/api/transactions?month=${month}`),
  getSummary: (month: string) => request<MonthlySummary>(`/api/summary?month=${month}`),
  createTransaction: (input: CreateTransactionInput) =>
    request<Transaction>('/api/transactions', { method: 'POST', body: JSON.stringify(input) }),
  updateTransaction: (id: number, input: CreateTransactionInput) =>
    request<Transaction>(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  deleteTransaction: (id: number) => request<void>(`/api/transactions/${id}`, { method: 'DELETE' }),
}
