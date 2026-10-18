// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { clearResetHash, readResetToken } from './password-reset'

const TOKEN = 'q3Vx_9-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'

describe('readResetToken', () => {
  it('lê o token do fragmento do link', () => {
    expect(readResetToken(`#reset=${TOKEN}`)).toBe(TOKEN)
  })

  it('ignora fragmento vazio, de outra coisa ou com lixo', () => {
    expect(readResetToken('')).toBeNull()
    expect(readResetToken('#conteudo')).toBeNull()
    expect(readResetToken('#reset=')).toBeNull()
    expect(readResetToken('#reset=curto')).toBeNull()
    expect(readResetToken(`#reset=${TOKEN}<script>`)).toBeNull()
  })
})

describe('clearResetHash', () => {
  afterEach(() => {
    history.replaceState(null, '', '/')
  })

  it('tira o token da URL sem criar entrada no histórico', () => {
    history.replaceState(null, '', `/?mes=2026-10#reset=${TOKEN}`)
    const entries = history.length

    clearResetHash()

    expect(location.hash).toBe('')
    expect(location.search).toBe('?mes=2026-10')
    expect(history.length).toBe(entries)
  })
})
