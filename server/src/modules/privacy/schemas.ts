import { z } from 'zod'

// Mesma regra do login: senha errada é 403, não 400, então o mínimo não é repetido aqui.
export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
})

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>
