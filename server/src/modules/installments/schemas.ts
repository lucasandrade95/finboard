import { z } from 'zod'
import { tagNameSchema } from '../transactions/schemas.js'

/** Teto de parcelas: 48 meses cobre de cartão a crediário sem virar série infinita. */
export const MAX_INSTALLMENTS = 48

export const createInstallmentSchema = z
  .object({
    // 190, não 200: cada parcela ganha o sufixo " (12/48)" e a transação aceita até 200.
    description: z.string().trim().min(1).max(190),
    totalCents: z.number().int().positive(),
    installmentCount: z.number().int().min(2).max(MAX_INSTALLMENTS),
    firstDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data esperada no formato YYYY-MM-DD'),
    category: z.string().trim().min(1).max(50).default('geral'),
    accountId: z.number().int().positive().nullable().default(null),
    tags: z.array(tagNameSchema).max(10).optional(),
  })
  // Parcela de zero centavo não existe: R$ 0,05 não se divide em 10 vezes.
  .refine((input) => input.totalCents >= input.installmentCount, {
    path: ['totalCents'],
    message: 'o total precisa ser de ao menos 1 centavo por parcela',
  })

export type CreateInstallmentInput = z.infer<typeof createInstallmentSchema>
