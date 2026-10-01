import { z } from 'zod'

export const createCategorySchema = z.object({
  // Mesmo limite do campo `category` da transação: o nome do catálogo vira esse texto.
  name: z.string().trim().min(1).max(50),
  // Hex de 6 dígitos é o que o `<input type="color">` produz; minúsculo para comparar fácil.
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'cor esperada no formato #rrggbb')
    .transform((value) => value.toLowerCase()),
  // Ícone é um emoji ou símbolo curto, opcional. Limite em code units cobre emoji composto.
  icon: z.string().trim().min(1).max(8).nullable().default(null),
})

export const updateCategorySchema = createCategorySchema

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
