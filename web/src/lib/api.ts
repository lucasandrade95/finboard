import { getToken, setToken } from './auth'

export type TransactionType = 'income' | 'expense'

export interface AuthUser {
  id: number
  email: string
}

export interface AuthSession {
  user: AuthUser
  token: string
}

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

export interface Goal {
  id: number
  name: string
  targetCents: number
  savedCents: number
  deadline: string | null
  createdAt: string
}

export interface GoalList {
  items: Goal[]
}

export interface CreateGoalInput {
  name: string
  targetCents: number
  savedCents?: number
  deadline?: string | null
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

export interface CsvImportRowError {
  line: number
  column?: string
  message: string
}

export interface CsvImportResult {
  imported: number
}

/** Arquivo rejeitado pela API: carrega o relatório linha a linha para a UI mostrar. */
export class CsvImportError extends Error {
  constructor(
    readonly errors: CsvImportRowError[],
    readonly errorCount: number,
  ) {
    super(`CSV com ${errorCount} erro(s)`)
    this.name = 'CsvImportError'
  }
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

/** Sessão inválida (token expirado, adulterado ou de outro segredo). */
export class UnauthorizedError extends Error {
  constructor() {
    super('sessão expirada')
    this.name = 'UnauthorizedError'
  }
}

function authHeaders(contentType: string): Record<string, string> {
  const token = getToken()
  return token
    ? { 'Content-Type': contentType, Authorization: `Bearer ${token}` }
    : { 'Content-Type': contentType }
}

/**
 * 401 numa rota de dados significa sessão morta: descarta o token guardado, o
 * que faz a UI voltar sozinha para a tela de login em vez de insistir em pedir
 * dados que nunca vão vir.
 */
function failIfUnauthorized(response: Response): void {
  if (response.status === 401) {
    setToken(null)
    throw new UnauthorizedError()
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: authHeaders('application/json'),
    ...init,
  })
  failIfUnauthorized(response)
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

/**
 * Login e registro não passam pelo `request`: aqui o 401 é credencial errada, não
 * sessão expirada, e a mensagem precisa ser legível na tela em vez de `API 401`.
 */
async function authenticate(path: string, email: string, password: string): Promise<AuthSession> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (response.ok) {
    return response.json() as Promise<AuthSession>
  }
  if (response.status === 401) {
    throw new Error('E-mail ou senha inválidos.')
  }
  if (response.status === 409) {
    throw new Error('Já existe uma conta com esse e-mail.')
  }
  if (response.status === 400) {
    throw new Error('Informe um e-mail válido e uma senha de 8 a 128 caracteres.')
  }
  throw new Error(`API ${response.status}: ${await response.text()}`)
}

export interface CsvExport {
  blob: Blob
  filename: string
}

/**
 * O export virou rota autenticada, então não dá mais para apontar uma âncora
 * direto para a URL: o arquivo é buscado com o header e entregue como blob para
 * o componente disparar o download.
 */
async function exportTransactionsCsv(month: string): Promise<CsvExport> {
  const response = await fetch(`/api/transactions/export.csv?month=${month}`, {
    headers: authHeaders('application/json'),
  })
  failIfUnauthorized(response)
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`)
  }
  // Nome vindo do Content-Disposition do server; o fallback cobre proxy que corta o header.
  const disposition = response.headers.get('content-disposition') ?? ''
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `transacoes-${month}.csv`
  return { blob: await response.blob(), filename }
}

// Fora do `request`: o 400 aqui não é falha genérica, é o relatório de erros do arquivo.
async function importTransactionsCsv(csv: string): Promise<CsvImportResult> {
  const response = await fetch('/api/transactions/import', {
    method: 'POST',
    headers: authHeaders('text/csv'),
    body: csv,
  })
  failIfUnauthorized(response)
  if (response.status === 400) {
    const body = (await response.json()) as {
      error?: string
      errors?: CsvImportRowError[]
      errorCount?: number
    }
    if (body.error === 'invalid_csv' && body.errors) {
      throw new CsvImportError(body.errors, body.errorCount ?? body.errors.length)
    }
    throw new Error(`API 400: ${JSON.stringify(body)}`)
  }
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`)
  }
  return response.json() as Promise<CsvImportResult>
}

export const api = {
  register: (email: string, password: string) =>
    authenticate('/api/auth/register', email, password),
  login: (email: string, password: string) => authenticate('/api/auth/login', email, password),
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
  exportTransactionsCsv,
  importTransactionsCsv,
  listBudgets: (month: string) => request<BudgetProgressList>(`/api/budgets?month=${month}`),
  upsertBudget: (category: string, amountCents: number) =>
    request<Budget>(`/api/budgets/${encodeURIComponent(category)}`, {
      method: 'PUT',
      body: JSON.stringify({ amountCents }),
    }),
  deleteBudget: (category: string) =>
    request<void>(`/api/budgets/${encodeURIComponent(category)}`, { method: 'DELETE' }),
  listGoals: () => request<GoalList>('/api/goals').then((data) => data.items),
  createGoal: (input: CreateGoalInput) =>
    request<Goal>('/api/goals', { method: 'POST', body: JSON.stringify(input) }),
  contributeToGoal: (id: number, amountCents: number) =>
    request<Goal>(`/api/goals/${id}/contributions`, {
      method: 'POST',
      body: JSON.stringify({ amountCents }),
    }),
  deleteGoal: (id: number) => request<void>(`/api/goals/${id}`, { method: 'DELETE' }),
}
