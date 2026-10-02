import { z } from 'zod'

export const transactionTypeSchema = z.enum(['income', 'expense'])

export const createTransactionSchema = z.object({
  type: transactionTypeSchema,
  description: z.string().trim().min(1).max(200),
  amountCents: z.number().int().positive(),
  category: z.string().trim().min(1).max(50).default('geral'),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data esperada no formato YYYY-MM-DD'),
  recurring: z.boolean().default(false),
  // Conta/carteira do lançamento; `null` é "sem conta" (o padrão de quem não usa contas).
  accountId: z.number().int().positive().nullable().default(null),
})

// Na edição, omitir `accountId` mantém a conta atual: cliente antigo que não conhece
// o campo não desvincula o lançamento sem querer. `null` explícito desvincula.
export const updateTransactionSchema = createTransactionSchema.extend({
  accountId: z.number().int().positive().nullable().optional(),
})

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const monthQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'mês esperado no formato YYYY-MM')
    .optional(),
})

// A série diária precisa de um intervalo fechado para gerar os dias: mês é obrigatório aqui.
export const requiredMonthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'mês esperado no formato YYYY-MM'),
})

export const listTransactionsQuerySchema = monthQuerySchema.extend({
  type: transactionTypeSchema.optional(),
  category: z.string().trim().min(1).max(50).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

// Corpo text/csv chega como string; JSON ou corpo vazio caem aqui com 400.
export const importCsvBodySchema = z.string({ message: 'envie o arquivo como text/csv' }).min(1)

export type TransactionType = z.infer<typeof transactionTypeSchema>
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>
