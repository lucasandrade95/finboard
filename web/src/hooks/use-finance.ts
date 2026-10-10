import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  type CreateAccountInput,
  type CreateCategoryInput,
  type CreateGoalInput,
  type CreateTransactionInput,
  type CreateInstallmentInput,
  type CreateTransferInput,
  type TransactionFilters,
} from '../lib/api'
import type { DateRange } from '../lib/period'

export function useTransactions(month: string, page: number, filters: TransactionFilters = {}) {
  const { from, to, type, category, q, tag } = filters
  return useQuery({
    // Chave só com primitivos: o objeto de filtros muda de referência a cada render.
    queryKey: [
      'transactions',
      month,
      page,
      from ?? null,
      to ?? null,
      type ?? null,
      category ?? null,
      q ?? null,
      tag ?? null,
    ],
    queryFn: () => api.listTransactions(month, page, { from, to, type, category, q, tag }),
  })
}

// Tags da conta inteira, não do mês: o filtro acha a "viagem" de qualquer período.
export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => api.listTags(),
  })
}

// Categorias vêm da API (distintas do mês), não do recorte filtrado da lista:
// assim o select não colapsa nas categorias da página atual.
export function useCategories(month: string) {
  return useQuery({
    queryKey: ['categories', month],
    queryFn: () => api.listCategories(month),
  })
}

// Catálogo não depende do mês: chave fixa, invalidada só pelas próprias mutações.
export function useCategoryCatalog() {
  return useQuery({
    queryKey: ['category-catalog'],
    queryFn: () => api.listCategoryCatalog(),
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCategoryInput) => api.createCategory(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['category-catalog'] })
    },
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteCategory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['category-catalog'] })
    },
  })
}

// Saldo da conta depende das transações: as mutações de transação também invalidam esta chave.
export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.listAccounts(),
  })
}

// Conta nova ou removida muda o saldo por conta do resumo: o summary entra junto.
function invalidateAccountQueries(queryClient: QueryClient): void {
  // O saldo inicial da conta entra no saldo de partida da projeção.
  for (const key of ['accounts', 'summary', 'transactions', 'projection']) {
    void queryClient.invalidateQueries({ queryKey: [key] })
  }
}

export function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAccountInput) => api.createAccount(input),
    onSuccess: () => invalidateAccountQueries(queryClient),
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteAccount(id),
    onSuccess: () => invalidateAccountQueries(queryClient),
  })
}

export function useExpensesByCategory(month: string, range?: DateRange) {
  const from = range?.from ?? ''
  const to = range?.to ?? ''
  return useQuery({
    queryKey: ['expenses-by-category', month, from, to],
    queryFn: () => api.getExpensesByCategory(month, { from, to }),
  })
}

export function useDailyBalance(month: string) {
  return useQuery({
    queryKey: ['daily-balance', month],
    queryFn: () => api.getDailyBalance(month),
  })
}

export function useYearlySummary(year: string) {
  return useQuery({
    queryKey: ['yearly-summary', year],
    queryFn: () => api.getYearlySummary(year),
  })
}

// `from` é o "hoje" do navegador: a projeção vira junto com o dia do usuário.
export function useProjection(from: string) {
  return useQuery({
    queryKey: ['projection', from],
    queryFn: () => api.getProjection(from),
  })
}

export function useBudgets(month: string) {
  return useQuery({
    queryKey: ['budgets', month],
    queryFn: () => api.listBudgets(month),
  })
}

export function useSummary(month: string) {
  return useQuery({
    queryKey: ['summary', month],
    queryFn: () => api.getSummary(month),
  })
}

// Toda mutação de transação mexe no gasto por categoria: orçamentos entram na invalidação.
function invalidateTransactionQueries(queryClient: QueryClient): void {
  for (const key of [
    'transactions',
    'summary',
    'categories',
    'expenses-by-category',
    'daily-balance',
    'yearly-summary',
    'projection',
    'budgets',
    'accounts',
    'transfers',
    'installments',
    'tags',
  ]) {
    void queryClient.invalidateQueries({ queryKey: [key] })
  }
}

export function useCreateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTransactionInput) => api.createTransaction(input),
    onSuccess: () => invalidateTransactionQueries(queryClient),
  })
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CreateTransactionInput }) =>
      api.updateTransaction(id, input),
    onSuccess: () => invalidateTransactionQueries(queryClient),
  })
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteTransaction(id),
    onSuccess: () => invalidateTransactionQueries(queryClient),
  })
}

export function useTransfers(month: string) {
  return useQuery({
    queryKey: ['transfers', month],
    queryFn: () => api.listTransfers(month),
  })
}

// Transferência cria/remove lançamentos: invalida tudo o que uma transação invalidaria.
export function useCreateTransfer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTransferInput) => api.createTransfer(input),
    onSuccess: () => invalidateTransactionQueries(queryClient),
  })
}

export function useDeleteTransfer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteTransfer(id),
    onSuccess: () => invalidateTransactionQueries(queryClient),
  })
}

export function useInstallments() {
  return useQuery({
    queryKey: ['installments'],
    queryFn: () => api.listInstallments(),
  })
}

// Parcelamento cria/remove N despesas de uma vez: mesma invalidação de uma transação.
export function useCreateInstallment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateInstallmentInput) => api.createInstallment(input),
    onSuccess: () => invalidateTransactionQueries(queryClient),
  })
}

export function useDeleteInstallment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteInstallment(id),
    onSuccess: () => invalidateTransactionQueries(queryClient),
  })
}

export function useImportTransactions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (csv: string) => api.importTransactionsCsv(csv),
    onSuccess: () => invalidateTransactionQueries(queryClient),
  })
}

export function useUpsertBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ category, amountCents }: { category: string; amountCents: number }) =>
      api.upsertBudget(category, amountCents),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['budgets'] })
    },
  })
}

export function useDeleteBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (category: string) => api.deleteBudget(category),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['budgets'] })
    },
  })
}

// Metas não dependem do mês nem das transações: chave fixa, invalidada só pelas próprias mutações.
export function useGoals() {
  return useQuery({
    queryKey: ['goals'],
    queryFn: () => api.listGoals(),
  })
}

export function useCreateGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateGoalInput) => api.createGoal(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['goals'] })
    },
  })
}

export function useContributeToGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, amountCents }: { id: number; amountCents: number }) =>
      api.contributeToGoal(id, amountCents),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['goals'] })
    },
  })
}

export function useDeleteGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteGoal(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['goals'] })
    },
  })
}
