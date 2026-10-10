/** Período customizado do seletor "De/Até". String vazia é ponta aberta. */
export interface DateRange {
  from: string
  to: string
}

export const EMPTY_RANGE: DateRange = { from: '', to: '' }

export function hasRange(range: Partial<DateRange>): boolean {
  return Boolean(range.from || range.to)
}

// Datas ISO (YYYY-MM-DD) comparam certo como texto: não precisa passar por Date.
export function isRangeInverted(range: DateRange): boolean {
  return Boolean(range.from && range.to && range.from > range.to)
}

/**
 * Parâmetros de data de uma requisição. Com alguma ponta preenchida, o período
 * substitui o mês — a API recusa os dois juntos —, e ponta vazia nem vai na URL.
 */
export function periodParams(
  month: string,
  range: Partial<DateRange> = {},
): Record<string, string> {
  if (!hasRange(range)) {
    return { month }
  }
  return {
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
  }
}
