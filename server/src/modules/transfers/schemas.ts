import { z } from 'zod'

export const createTransferSchema = z
  .object({
    fromAccountId: z.number().int().positive(),
    toAccountId: z.number().int().positive(),
    amountCents: z.number().int().positive(),
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data esperada no formato YYYY-MM-DD'),
    description: z.string().trim().min(1).max(200).default('Transferência'),
  })
  // Transferir para a mesma conta geraria um par que se anula: é erro de digitação.
  .refine((input) => input.fromAccountId !== input.toAccountId, {
    path: ['toAccountId'],
    message: 'a conta de destino deve ser diferente da origem',
  })

export type CreateTransferInput = z.infer<typeof createTransferSchema>
