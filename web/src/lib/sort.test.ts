import { describe, expect, it } from 'vitest'
import { ariaSort, DEFAULT_SORT, isDefaultSort, nextSort } from './sort'

describe('nextSort', () => {
  it('inverte o sentido ao clicar de novo na coluna ordenada', () => {
    expect(nextSort(DEFAULT_SORT, 'date')).toEqual({ column: 'date', direction: 'asc' })
    expect(nextSort({ column: 'date', direction: 'asc' }, 'date')).toEqual(DEFAULT_SORT)
  })

  it('começa valor do maior para o menor e categoria de A a Z', () => {
    expect(nextSort(DEFAULT_SORT, 'amount')).toEqual({ column: 'amount', direction: 'desc' })
    expect(nextSort(DEFAULT_SORT, 'category')).toEqual({ column: 'category', direction: 'asc' })
  })

  it('trocar de coluna ignora o sentido da coluna anterior', () => {
    expect(nextSort({ column: 'category', direction: 'desc' }, 'date')).toEqual(DEFAULT_SORT)
  })
})

describe('isDefaultSort', () => {
  it('reconhece só data decrescente como padrão', () => {
    expect(isDefaultSort({ column: 'date', direction: 'desc' })).toBe(true)
    expect(isDefaultSort({ column: 'date', direction: 'asc' })).toBe(false)
    expect(isDefaultSort({ column: 'amount', direction: 'desc' })).toBe(false)
  })
})

describe('ariaSort', () => {
  it('anuncia o sentido só na coluna ordenada', () => {
    const sort = { column: 'amount', direction: 'asc' } as const
    expect(ariaSort(sort, 'amount')).toBe('ascending')
    expect(ariaSort({ ...sort, direction: 'desc' }, 'amount')).toBe('descending')
    expect(ariaSort(sort, 'date')).toBe('none')
  })
})
