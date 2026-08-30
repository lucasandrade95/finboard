import type { CategoryTotal } from './api'

// Geometria do donut. Fica fora do componente para ser testável sem renderizar SVG.
export const DONUT_SIZE = 160
export const DONUT_CENTER = DONUT_SIZE / 2
export const DONUT_RADIUS = 60
export const DONUT_STROKE = 24
export const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS

// Acima disso o gráfico vira confete: as menores viram uma fatia "outras".
export const MAX_SLICES = 6
export const OTHERS_LABEL = 'outras'

const PALETTE = ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#65a30d']
const FALLBACK_COLOR = '#94a3b8'

export interface DonutSlice {
  category: string
  totalCents: number
  percent: number
  color: string
  /** Comprimento do arco em unidades de viewBox (vira `stroke-dasharray`). */
  dashLength: number
  /** Deslocamento negativo acumulado que empurra a fatia para depois da anterior. */
  dashOffset: number
}

function sliceColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? FALLBACK_COLOR
}

/**
 * Converte totais por categoria em arcos de um donut desenhado com `stroke-dasharray`
 * em círculos concêntricos — sem biblioteca de gráficos. A técnica de dasharray (em vez
 * de `<path>` com arcos) sobrevive ao caso de uma única categoria com 100%, que num
 * arco degeneraria em ponto.
 */
export function buildDonutSlices(items: CategoryTotal[]): DonutSlice[] {
  const positives = items.filter((item) => item.totalCents > 0)
  const totalCents = positives.reduce((sum, item) => sum + item.totalCents, 0)
  if (totalCents === 0) {
    return []
  }

  // Não depende da ordem da API: ordena aqui para o agrupamento em "outras" ser previsível.
  const ordered = [...positives].sort(
    (a, b) => b.totalCents - a.totalCents || a.category.localeCompare(b.category, 'pt-BR'),
  )
  const visible =
    ordered.length > MAX_SLICES
      ? [
          ...ordered.slice(0, MAX_SLICES - 1),
          {
            category: OTHERS_LABEL,
            totalCents: ordered
              .slice(MAX_SLICES - 1)
              .reduce((sum, item) => sum + item.totalCents, 0),
          },
        ]
      : ordered

  let consumed = 0
  return visible.map((item, index) => {
    const fraction = item.totalCents / totalCents
    const dashLength = fraction * DONUT_CIRCUMFERENCE
    const slice: DonutSlice = {
      category: item.category,
      totalCents: item.totalCents,
      percent: fraction * 100,
      color: sliceColor(index),
      dashLength,
      dashOffset: -consumed,
    }
    consumed += dashLength
    return slice
  })
}

export function formatPercent(percent: number): string {
  return `${percent.toFixed(1).replace('.', ',')}%`
}
