import { describe, expect, it } from 'vitest'
import { formatTagsInput, MAX_TAGS, parseTagsInput, tagsWithinLimits } from './tags'

describe('parseTagsInput', () => {
  it('separa por vírgula e tira os espaços das pontas', () => {
    expect(parseTagsInput(' viagem ,férias,  Chile ')).toEqual(['viagem', 'férias', 'Chile'])
  })

  it('descarta pedaços vazios', () => {
    expect(parseTagsInput('')).toEqual([])
    expect(parseTagsInput(' , viagem,, ,')).toEqual(['viagem'])
  })

  it('mantém a primeira grafia de tags repetidas sem diferenciar maiúsculas', () => {
    expect(parseTagsInput('Viagem, viagem, VIAGEM, Férias, férias')).toEqual(['Viagem', 'Férias'])
  })

  it('volta ao texto do campo com formatTagsInput', () => {
    expect(parseTagsInput(formatTagsInput(['casa', 'fixo']))).toEqual(['casa', 'fixo'])
  })
})

describe('tagsWithinLimits', () => {
  it('aceita até o máximo de tags com até 30 caracteres', () => {
    expect(tagsWithinLimits([])).toBe(true)
    expect(tagsWithinLimits(['x'.repeat(30)])).toBe(true)
    expect(tagsWithinLimits(Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`))).toBe(true)
  })

  it('recusa tag longa demais ou tags demais', () => {
    expect(tagsWithinLimits(['x'.repeat(31)])).toBe(false)
    expect(tagsWithinLimits(Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`))).toBe(false)
  })
})
