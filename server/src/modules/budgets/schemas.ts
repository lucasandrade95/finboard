import { z } from 'zod'

export const budgetCategoryParamSchema = z.object({
  category: z.string().trim().min(1).max(50),
})

export const upsertBudgetSchema = z.object({
  amountCents: z.number().int().positive(),
})

export type UpsertBudgetInput = z.infer<typeof upsertBudgetSchema>
