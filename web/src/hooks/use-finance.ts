import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  type CreateGoalInput,
  type CreateTransactionInput,
  type TransactionFilters,
} from '../lib/api'

export function useTransactions(month: string, page: number, filters: TransactionFilters = {}) {
  const { type, category, q } = filters
  return useQuery({
    // Chave só com primitivos: o objeto de filtros muda de referência a cada render.
    queryKey: ['transactions', month, page, type ?? null, category ?? null, q ?? null],
    queryFn: () => api.listTransactions(month, page, { type, category, q }),
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

export function useExpensesByCategory(month: string) {
  return useQuery({
    queryKey: ['expenses-by-category', month],
    queryFn: () => api.getExpensesByCategory(month),
  })
}

export function useDailyBalance(month: string) {
  return useQuery({
    queryKey: ['daily-balance', month],
    queryFn: () => api.getDailyBalance(month),
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
    'budgets',
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
