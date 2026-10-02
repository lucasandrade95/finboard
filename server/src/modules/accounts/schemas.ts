import { z } from 'zod'

export const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(50),
  // Centavos com sinal: conta pode começar no negativo (cartão, cheque especial).
  openingBalanceCents: z.number().int().default(0),
})

export const updateAccountSchema = createAccountSchema

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>
