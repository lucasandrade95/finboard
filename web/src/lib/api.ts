export type TransactionType = 'income' | 'expense'

export interface Transaction {
  id: number
  type: TransactionType
  description: string
  amountCents: number
  category: string
  occurredOn: string
  recurring: boolean
  createdAt: string
}

export interface TransactionPage {
  items: Transaction[]
  total: number
  limit: number
  offset: number
}

export interface CategoryList {
  categories: string[]
}

export interface MonthlySummary {
  incomeCents: number
  expenseCents: number
  balanceCents: number
  previous?: PreviousMonthSummary
}

export interface PreviousMonthSummary {
  month: string
  incomeCents: number
  expenseCents: number
  balanceCents: number
}

export interface CategoryTotal {
  category: string
  totalCents: number
}

export interface ExpensesByCategory {
  items: CategoryTotal[]
  totalCents: number
}

export interface DailyBalancePoint {
  date: string
  incomeCents: number
  expenseCents: number
  netCents: number
  balanceCents: number
}

export interface DailyBalance {
  month: string
  items: DailyBalancePoint[]
}

export interface BudgetProgress {
  category: string
  budgetCents: number
  spentCents: number
}

export interface BudgetProgressList {
  month: string
  items: BudgetProgress[]
}

export interface Budget {
  category: string
  amountCents: number
}

export interface CreateTransactionInput {
  type: TransactionType
  description: string
  amountCents: number
  category?: string
  occurredOn: string
  recurring?: boolean
}

export interface TransactionFilters {
  type?: TransactionType
  category?: string
  q?: string
}

export const PAGE_SIZE = 20

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
  listTransactions: (month: string, page: number, filters: TransactionFilters = {}) => {
    const params = new URLSearchParams({
      month,
      limit: String(PAGE_SIZE),
      offset: String((page - 1) * PAGE_SIZE),
    })
    if (filters.type) {
      params.set('type', filters.type)
    }
    if (filters.category) {
      params.set('category', filters.category)
    }
    if (filters.q) {
      params.set('q', filters.q)
    }
    return request<TransactionPage>(`/api/transactions?${params.toString()}`)
  },
  listCategories: (month: string) =>
    request<CategoryList>(`/api/categories?month=${month}`).then((data) => data.categories),
  getSummary: (month: string) => request<MonthlySummary>(`/api/summary?month=${month}`),
  getExpensesByCategory: (month: string) =>
    request<ExpensesByCategory>(`/api/expenses-by-category?month=${month}`),
  getDailyBalance: (month: string) => request<DailyBalance>(`/api/daily-balance?month=${month}`),
  createTransaction: (input: CreateTransactionInput) =>
    request<Transaction>('/api/transactions', { method: 'POST', body: JSON.stringify(input) }),
  updateTransaction: (id: number, input: CreateTransactionInput) =>
    request<Transaction>(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  deleteTransaction: (id: number) => request<void>(`/api/transactions/${id}`, { method: 'DELETE' }),
  listBudgets: (month: string) => request<BudgetProgressList>(`/api/budgets?month=${month}`),
  upsertBudget: (category: string, amountCents: number) =>
    request<Budget>(`/api/budgets/${encodeURIComponent(category)}`, {
      method: 'PUT',
      body: JSON.stringify({ amountCents }),
    }),
  deleteBudget: (category: string) =>
    request<void>(`/api/budgets/${encodeURIComponent(category)}`, { method: 'DELETE' }),
}
