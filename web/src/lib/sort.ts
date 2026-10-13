export type SortColumn = 'date' | 'amount' | 'category'
export type SortDirection = 'asc' | 'desc'

export interface TransactionSort {
  column: SortColumn
  direction: SortDirection
}

/** O que a API faz sem `sort`/`order`: data, a mais recente primeiro. */
export const DEFAULT_SORT: TransactionSort = { column: 'date', direction: 'desc' }

// Primeiro clique numa coluna vai para o sentido mais útil dela: datas e valores
// do maior para o menor (o recente, o caro), categorias de A a Z.
const FIRST_DIRECTION: Record<SortColumn, SortDirection> = {
  date: 'desc',
  amount: 'desc',
  category: 'asc',
}

/** Clique no cabeçalho: na coluna atual inverte o sentido; em outra, começa pelo padrão dela. */
export function nextSort(current: TransactionSort, column: SortColumn): TransactionSort {
  if (current.column === column) {
    return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { column, direction: FIRST_DIRECTION[column] }
}

export function isDefaultSort(sort: TransactionSort): boolean {
  return sort.column === DEFAULT_SORT.column && sort.direction === DEFAULT_SORT.direction
}

/** Valor do `aria-sort` do cabeçalho: só a coluna ordenada anuncia sentido. */
export function ariaSort(
  sort: TransactionSort,
  column: SortColumn,
): 'ascending' | 'descending' | 'none' {
  if (sort.column !== column) {
    return 'none'
  }
  return sort.direction === 'asc' ? 'ascending' : 'descending'
}
