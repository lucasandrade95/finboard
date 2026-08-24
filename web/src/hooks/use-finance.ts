import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type CreateTransactionInput } from '../lib/api'

export function useTransactions(month: string, page: number, category?: string) {
  return useQuery({
    queryKey: ['transactions', month, page, category ?? null],
    queryFn: () => api.listTransactions(month, page, category),
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
    },
  })
}
