import { z } from 'zod'

export const createGoalSchema = z.object({
  name: z.string().trim().min(1).max(80),
  targetCents: z.number().int().positive(),
  savedCents: z.number().int().nonnegative().default(0),
  // Prazo é opcional: meta "sem data" é válida (fundo de emergência, por exemplo).
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'data esperada no formato YYYY-MM-DD')
    .nullable()
    .default(null),
})

export const updateGoalSchema = createGoalSchema

export const contributionSchema = z.object({
  amountCents: z.number().int().positive(),
})

export type CreateGoalInput = z.infer<typeof createGoalSchema>
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>
