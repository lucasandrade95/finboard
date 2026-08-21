import { describe, expect, it } from 'vitest'
import { formatBRL, parseReaisToCents } from './api'

describe('formatBRL', () => {
  it('formata centavos como moeda brasileira', () => {
    expect(formatBRL(123456)).toMatch(/R\$\s1\.234,56/)
    expect(formatBRL(0)).toMatch(/R\$\s0,00/)
  })
})

describe('parseReaisToCents', () => {
  it('converte formato brasileiro para centavos', () => {
    expect(parseReaisToCents('159,90')).toBe(15990)
    expect(parseReaisToCents('1.234,56')).toBe(123456)
    expect(parseReaisToCents('50')).toBe(5000)
  })

  it('rejeita valor não numérico', () => {
    expect(() => parseReaisToCents('abc')).toThrow()
  })
})
