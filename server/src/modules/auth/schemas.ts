import { z } from 'zod'

// Normaliza antes de validar: "  Lucas@Example.com " e "lucas@example.com" são a mesma conta.
const emailSchema = z.string().trim().toLowerCase().email('e-mail inválido').max(254)

// Teto evita que uma senha gigante vire custo de CPU/memória no hash.
const newPasswordSchema = z.string().min(8, 'senha precisa de ao menos 8 caracteres').max(128)

export const registerSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
})

// No login a regra de tamanho mínimo não é repetida: senha errada é 401, não 400,
// para a resposta não revelar a política de senha nem diferenciar os casos.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>

// O valor emitido tem 43 caracteres (32 bytes em base64url); o teto só barra lixo grande.
export const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(256),
})

export type RefreshInput = z.infer<typeof refreshSchema>

export const forgotPasswordSchema = z.object({ email: emailSchema })

// Senha nova segue a mesma política do cadastro; o token tem 43 caracteres (base64url).
export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(256),
  password: newPasswordSchema,
})

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
