import { z } from 'zod'

export const transactionTypeSchema = z.enum(['income', 'expense'])

export const createTransactionSchema = z.object({
  type: transactionTypeSchema,
  description: z.string().trim().min(1).max(200),
  amountCents: z.number().int().positive(),
  category: z.string().trim().min(1).max(50).default('geral'),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data esperada no formato YYYY-MM-DD'),
})

export const updateTransactionSchema = createTransactionSchema

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const monthQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'mês esperado no formato YYYY-MM')
    .optional(),
})

export const listTransactionsQuerySchema = monthQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export type TransactionType = z.infer<typeof transactionTypeSchema>
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>
