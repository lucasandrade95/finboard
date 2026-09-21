export type SkeletonShape = 'text' | 'chart' | 'circle' | 'value'

interface SkeletonProps {
  /** Uma barra por linha que o conteúdo real vai ocupar quando chegar. */
  lines?: number
  /** Forma do bloco; o tamanho de cada barra sai do CSS da variante. */
  shape?: SkeletonShape
  /** Texto para leitor de tela — as barras em si são decorativas. */
  label?: string
}

/**
 * Placeholder de carregamento. O bloco ocupa mais ou menos o espaço do conteúdo
 * real, então a página não pula quando a resposta chega — que era o problema do
 * "Carregando…" de uma linha só.
 *
 * Acessibilidade: as barras são `aria-hidden` (não têm significado) e o estado
 * vai por um `role="status"` com o texto escondido, que o leitor de tela
 * anuncia uma vez quando o bloco aparece.
 *
 * Tudo em `<span>` para o bloco ser válido dentro de `<p>` também.
 */
export function Skeleton({ lines = 3, shape = 'text', label = 'Carregando…' }: SkeletonProps) {
  return (
    <span className={`skeleton skeleton-${shape}`} role="status">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="skeleton-bar" aria-hidden="true" />
      ))}
    </span>
  )
}
