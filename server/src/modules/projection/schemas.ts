import { z } from 'zod'
import { addDays } from './repository.js'

/** Horizonte máximo da projeção: além de 3 meses a série recorrente vira chute. */
export const MAX_PROJECTION_DAYS = 90

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const projectionQuerySchema = z.object({
  // "Hoje" do ponto de vista do cliente: o fuso do navegador decide quando o dia vira.
  from: z
    .string()
    .regex(DATE_PATTERN, 'data esperada no formato YYYY-MM-DD')
    // 2026-02-31 passa na regex; somar zero dias normaliza a data e denuncia a inexistente.
    // O Zod roda o refine mesmo com a regex falhando: fora do formato, quem reclama é ela.
    .refine((date) => !DATE_PATTERN.test(date) || addDays(date, 0) === date, 'data inexistente')
    .optional(),
  days: z.coerce.number().int().min(1).max(MAX_PROJECTION_DAYS).default(30),
})
