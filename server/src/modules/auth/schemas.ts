import { z } from 'zod'

// Normaliza antes de validar: "  Lucas@Example.com " e "lucas@example.com" são a mesma conta.
const emailSchema = z.string().trim().toLowerCase().email('e-mail inválido').max(254)

export const registerSchema = z.object({
  email: emailSchema,
  // Teto evita que uma senha gigante vire custo de CPU/memória no hash.
  password: z.string().min(8, 'senha precisa de ao menos 8 caracteres').max(128),
})

// No login a regra de tamanho mínimo não é repetida: senha errada é 401, não 400,
// para a resposta não revelar a política de senha nem diferenciar os casos.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
