import { describe, expect, it } from 'vitest'
import { attachmentProblem, isPdf, MAX_ATTACHMENT_BYTES } from './attachments'

describe('attachmentProblem', () => {
  it('aceita imagens e PDF dentro do limite', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']) {
      expect(attachmentProblem({ type, size: 1024 })).toBeNull()
    }
    expect(attachmentProblem({ type: 'image/png', size: MAX_ATTACHMENT_BYTES })).toBeNull()
  })

  it('recusa tipo fora da lista antes de olhar o tamanho', () => {
    expect(attachmentProblem({ type: 'image/gif', size: 10 })).toBe('type')
    expect(attachmentProblem({ type: '', size: MAX_ATTACHMENT_BYTES + 1 })).toBe('type')
  })

  it('recusa arquivo vazio ou acima de 2 MB', () => {
    expect(attachmentProblem({ type: 'image/png', size: 0 })).toBe('size')
    expect(attachmentProblem({ type: 'image/png', size: MAX_ATTACHMENT_BYTES + 1 })).toBe('size')
  })
})

describe('isPdf', () => {
  it('distingue PDF de imagem pelo tipo do blob', () => {
    expect(isPdf({ type: 'application/pdf' })).toBe(true)
    expect(isPdf({ type: 'image/png' })).toBe(false)
  })
})
