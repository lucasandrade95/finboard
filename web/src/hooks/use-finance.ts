import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type CreateTransactionInput, type TransactionFilters } from '../lib/api'

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

export function useSummary(month: string) {
  return useQuery({
    queryKey: ['summary', month],
    queryFn: () => api.getSummary(month),
  })
}

export function useCreateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTransactionInput) => api.createTransaction(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['summary'] })
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CreateTransactionInput }) =>
      api.updateTransaction(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['summary'] })
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteTransaction(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['summary'] })
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}
