import { locale, t } from '../i18n'
import { getRefreshToken, getToken, setSession, setToken } from './auth'
import { type DateRange, periodParams } from './period'
import { isDefaultSort, type TransactionSort } from './sort'

export type TransactionType = 'income' | 'expense'

export interface AuthUser {
  id: number
  email: string
}

export interface AuthSession {
  user: AuthUser
  /** JWT de acesso, 15 minutos. */
  token: string
  /** Uso único: cada renovação devolve outro (ver `refreshSession`). */
  refreshToken: string
}

export interface Transaction {
  id: number
  type: TransactionType
  description: string
  amountCents: number
  category: string
  occurredOn: string
  recurring: boolean
  accountId: number | null
  /** Perna de transferência entre contas: só muda pela própria transferência. */
  transferId: number | null
  /** Parcela de compra parcelada: só muda pelo próprio parcelamento. */
  installmentId: number | null
  installmentNumber: number | null
  /** Tags livres, em ordem alfabética. */
  tags: string[]
  /** Há comprovante anexado (o arquivo vem de `/api/transactions/:id/attachment`). */
  hasAttachment: boolean
  createdAt: string
}

export type AuditAction = 'created' | 'updated' | 'deleted'

export type AuditedField =
  | 'type'
  | 'description'
  | 'amountCents'
  | 'category'
  | 'occurredOn'
  | 'recurring'
  | 'accountId'
  | 'tags'

export type AuditValue = string | number | boolean | string[] | null

export interface FieldChange {
  field: AuditedField
  from: AuditValue
  to: AuditValue
}

/** Um registro do histórico: `at` é UTC em ISO, `changes` traz só os campos que mudaram. */
export interface AuditEntry {
  id: number
  transactionId: number
  action: AuditAction
  changes: FieldChange[]
  actor: { id: number; email: string }
  at: string
}

export interface TransactionHistory {
  items: AuditEntry[]
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

export interface TagList {
  tags: string[]
}

/** Categoria do catálogo da conta: o `name` é o mesmo texto gravado na transação. */
export interface Category {
  id: number
  name: string
  color: string
  icon: string | null
  createdAt: string
}

export interface CategoryCatalog {
  items: Category[]
}

export interface CreateCategoryInput {
  name: string
  color: string
  icon?: string | null
}

/** Conta/carteira com o saldo atual (saldo inicial + todos os lançamentos dela). */
export interface Account {
  id: number
  name: string
  openingBalanceCents: number
  balanceCents: number
  createdAt: string
}

export interface AccountList {
  items: Account[]
}

export interface CreateAccountInput {
  name: string
  openingBalanceCents?: number
}

/** Par de lançamentos vinculados: saída na origem, entrada no destino. */
export interface Transfer {
  id: number
  /** `null` quando a conta foi removida depois da transferência. */
  fromAccountId: number | null
  toAccountId: number | null
  amountCents: number
  occurredOn: string
  description: string
  createdAt: string
}

export interface TransferList {
  items: Transfer[]
}

export interface CreateTransferInput {
  fromAccountId: number
  toAccountId: number
  amountCents: number
  occurredOn: string
  description?: string
}

/** Compra parcelada: uma despesa por mês, de `firstDueOn` a `lastDueOn`. */
export interface Installment {
  id: number
  description: string
  totalCents: number
  installmentCount: number
  category: string
  accountId: number | null
  firstDueOn: string
  lastDueOn: string
  createdAt: string
}

export interface InstallmentList {
  items: Installment[]
}

export interface CreateInstallmentInput {
  description: string
  totalCents: number
  installmentCount: number
  firstDueOn: string
  category?: string
  accountId?: number | null
}

/** Saldo de uma conta no fim do mês do resumo. */
export interface AccountBalance {
  id: number
  name: string
  balanceCents: number
}

export interface MonthlySummary {
  incomeCents: number
  expenseCents: number
  balanceCents: number
  previous?: PreviousMonthSummary
  accounts?: AccountBalance[]
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

export interface MonthlyTotals {
  month: string
  incomeCents: number
  expenseCents: number
  netCents: number
}

/** Sempre 12 meses, de janeiro a dezembro, com os totais do ano ao lado. */
export interface YearlySummary {
  year: string
  items: MonthlyTotals[]
  incomeCents: number
  expenseCents: number
  netCents: number
}

/** Parcela, lançamento já gravado com data futura ou cópia prevista de recorrente. */
export type ProjectionSource = 'scheduled' | 'installment' | 'recurring'

export interface ProjectionEvent {
  date: string
  type: TransactionType
  description: string
  category: string
  amountCents: number
  source: ProjectionSource
}

export interface BalanceProjection {
  from: string
  to: string
  startingBalanceCents: number
  endingBalanceCents: number
  lowestBalanceCents: number
  lowestBalanceOn: string
  events: ProjectionEvent[]
  /** Um ponto por dia depois de `from`, no mesmo formato da série diária do mês. */
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
  /** `null` desvincula; omitido na edição mantém a conta atual. */
  accountId?: number | null
  /** Omitido na edição mantém as tags atuais; `[]` remove todas. */
  tags?: string[]
}

export interface TransactionFilters {
  /** Período customizado: com alguma ponta preenchida, substitui o mês na consulta. */
  from?: string
  to?: string
  type?: TransactionType
  category?: string
  q?: string
  tag?: string
  /** Ordenação da tabela; omitida ou padrão não vai na URL (a API já ordena por data). */
  sort?: TransactionSort
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

const brlFormatter = new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' })

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

let pendingRefresh: Promise<boolean> | null = null

/**
 * Troca o refresh token guardado por um par novo. Uma renovação por vez: as várias
 * queries do dashboard que tomam 401 juntas esperam o mesmo `/refresh` — mandar o
 * mesmo token duas vezes seria lido pelo server como reuso e derrubaria a sessão.
 * Falha de rede sobe como erro (não é motivo para deslogar); só a recusa do server
 * conta como sessão morta.
 */
function refreshSession(): Promise<boolean> {
  pendingRefresh ??= (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      return false
    }
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!response.ok) {
      return false
    }
    setSession((await response.json()) as AuthSession)
    return true
  })().finally(() => {
    pendingRefresh = null
  })
  return pendingRefresh
}

/**
 * `fetch` das rotas protegidas. O JWT vence a cada 15 minutos, então o primeiro 401
 * tenta renovar a sessão e repete o pedido uma vez, com o token novo. Se nem assim
 * passa, a sessão morreu: descarta os tokens, o que faz a UI voltar sozinha para a
 * tela de login em vez de insistir em pedir dados que nunca vão vir.
 */
async function authorizedFetch(
  path: string,
  init: RequestInit = {},
  contentType = 'application/json',
): Promise<Response> {
  const send = () => fetch(path, { headers: authHeaders(contentType), ...init })
  let response = await send()
  if (response.status === 401 && (await refreshSession())) {
    response = await send()
  }
  if (response.status === 401) {
    setToken(null)
    throw new UnauthorizedError()
  }
  return response
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authorizedFetch(path, init)
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
    throw new Error(t.auth.invalidCredentials)
  }
  if (response.status === 409) {
    throw new Error(t.auth.emailTaken)
  }
  if (response.status === 400) {
    throw new Error(t.auth.invalidInput)
  }
  throw new Error(`API ${response.status}: ${await response.text()}`)
}

/**
 * "Sair" deste dispositivo. A sessão local acaba na hora; avisar o server é melhor
 * esforço — sem rede, o refresh token só deixa de existir aqui e vence sozinho.
 */
async function logout(): Promise<void> {
  const refreshToken = getRefreshToken()
  setToken(null)
  if (!refreshToken) {
    return
  }
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => undefined)
}

/**
 * Derruba as sessões de todos os dispositivos, esta inclusive. Aqui o server precisa
 * confirmar: se a chamada falhar, a sessão local fica para o usuário tentar de novo.
 */
async function logoutAll(): Promise<number> {
  const { revokedSessions } = await request<{ revokedSessions: number }>(
    '/api/auth/logout-all',
    // Corpo vazio com Content-Type JSON é 400 no Fastify: manda um objeto vazio.
    { method: 'POST', body: '{}' },
  )
  setToken(null)
  return revokedSessions
}

export interface FileDownload {
  blob: Blob
  filename: string
}

/**
 * Exports são rotas autenticadas, então não dá para apontar uma âncora direto
 * para a URL: o arquivo é buscado com o header e entregue como blob para o
 * componente disparar o download.
 */
async function downloadFile(path: string, fallbackFilename: string): Promise<FileDownload> {
  const response = await authorizedFetch(path)
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`)
  }
  // Nome vindo do Content-Disposition do server; o fallback cobre proxy que corta o header.
  const disposition = response.headers.get('content-disposition') ?? ''
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackFilename
  return { blob: await response.blob(), filename }
}

const exportTransactionsCsv = (month: string) =>
  downloadFile(`/api/transactions/export.csv?month=${month}`, `transacoes-${month}.csv`)

const exportMonthlyReport = (month: string) =>
  downloadFile(`/api/reports/monthly.pdf?month=${month}`, `relatorio-${month}.pdf`)

// Fora do `request`: o 400 aqui não é falha genérica, é o relatório de erros do arquivo.
async function importTransactionsCsv(csv: string): Promise<CsvImportResult> {
  const response = await authorizedFetch(
    '/api/transactions/import',
    { method: 'POST', body: csv },
    'text/csv',
  )
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

// Bytes crus com o Content-Type do arquivo: o server confere tipo e assinatura. Ler antes
// (no máximo 2 MB, já validado) dá um ArrayBuffer que qualquer `fetch` aceita como corpo,
// inclusive o do Node nos testes, onde o File do jsdom viraria "[object File]".
async function uploadAttachment(id: number, file: File): Promise<void> {
  const response = await authorizedFetch(
    `/api/transactions/${id}/attachment`,
    { method: 'PUT', body: await file.arrayBuffer() },
    file.type,
  )
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`)
  }
}

/** Como no export: a rota exige o header, então o preview usa blob, não `<img src>` direto. */
async function fetchAttachment(id: number): Promise<Blob> {
  const response = await authorizedFetch(`/api/transactions/${id}/attachment`)
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`)
  }
  return response.blob()
}

export const api = {
  register: (email: string, password: string) =>
    authenticate('/api/auth/register', email, password),
  login: (email: string, password: string) => authenticate('/api/auth/login', email, password),
  logout,
  logoutAll,
  listTransactions: (month: string, page: number, filters: TransactionFilters = {}) => {
    const params = new URLSearchParams({
      ...periodParams(month, filters),
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
    if (filters.tag) {
      params.set('tag', filters.tag)
    }
    if (filters.sort && !isDefaultSort(filters.sort)) {
      params.set('sort', filters.sort.column)
      params.set('order', filters.sort.direction)
    }
    return request<TransactionPage>(`/api/transactions?${params.toString()}`)
  },
  listCategories: (month: string) =>
    request<CategoryList>(`/api/categories?month=${month}`).then((data) => data.categories),
  listTags: () => request<TagList>('/api/tags').then((data) => data.tags),
  listCategoryCatalog: () =>
    request<CategoryCatalog>('/api/categories/catalog').then((data) => data.items),
  createCategory: (input: CreateCategoryInput) =>
    request<Category>('/api/categories/catalog', { method: 'POST', body: JSON.stringify(input) }),
  deleteCategory: (id: number) =>
    request<void>(`/api/categories/catalog/${id}`, { method: 'DELETE' }),
  listAccounts: () => request<AccountList>('/api/accounts').then((data) => data.items),
  createAccount: (input: CreateAccountInput) =>
    request<Account>('/api/accounts', { method: 'POST', body: JSON.stringify(input) }),
  deleteAccount: (id: number) => request<void>(`/api/accounts/${id}`, { method: 'DELETE' }),
  listTransfers: (month: string) =>
    request<TransferList>(`/api/transfers?month=${month}`).then((data) => data.items),
  createTransfer: (input: CreateTransferInput) =>
    request<Transfer>('/api/transfers', { method: 'POST', body: JSON.stringify(input) }),
  deleteTransfer: (id: number) => request<void>(`/api/transfers/${id}`, { method: 'DELETE' }),
  listInstallments: () => request<InstallmentList>('/api/installments').then((data) => data.items),
  createInstallment: (input: CreateInstallmentInput) =>
    request<Installment>('/api/installments', { method: 'POST', body: JSON.stringify(input) }),
  deleteInstallment: (id: number) => request<void>(`/api/installments/${id}`, { method: 'DELETE' }),
  getSummary: (month: string) => request<MonthlySummary>(`/api/summary?month=${month}`),
  getExpensesByCategory: (month: string, range?: DateRange) =>
    request<ExpensesByCategory>(
      `/api/expenses-by-category?${new URLSearchParams(periodParams(month, range)).toString()}`,
    ),
  getDailyBalance: (month: string) => request<DailyBalance>(`/api/daily-balance?month=${month}`),
  getYearlySummary: (year: string) => request<YearlySummary>(`/api/yearly-summary?year=${year}`),
  getProjection: (from: string) => request<BalanceProjection>(`/api/projection?from=${from}`),
  createTransaction: (input: CreateTransactionInput) =>
    request<Transaction>('/api/transactions', { method: 'POST', body: JSON.stringify(input) }),
  updateTransaction: (id: number, input: CreateTransactionInput) =>
    request<Transaction>(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  deleteTransaction: (id: number) => request<void>(`/api/transactions/${id}`, { method: 'DELETE' }),
  getTransactionHistory: (id: number) =>
    request<TransactionHistory>(`/api/transactions/${id}/history`).then((data) => data.items),
  uploadAttachment,
  fetchAttachment,
  deleteAttachment: (id: number) =>
    request<void>(`/api/transactions/${id}/attachment`, { method: 'DELETE' }),
  exportTransactionsCsv,
  exportMonthlyReport,
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
