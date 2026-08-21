import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type CreateTransactionInput } from '../lib/api'

export function useTransactions(month: string) {
  return useQuery({
    queryKey: ['transactions', month],
    queryFn: () => api.listTransactions(month),
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
