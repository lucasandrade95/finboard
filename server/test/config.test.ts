import { describe, expect, it } from 'vitest'
import { DEV_JWT_SECRET, loadConfig } from '../src/config.js'

describe('loadConfig', () => {
  it('usa os padrões de desenvolvimento sem nenhuma variável', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      dbPath: 'data/finboard.db',
      jwtSecret: DEV_JWT_SECRET,
      trustProxy: false,
    })
  })

  it('lê porta, banco e segredo do ambiente', () => {
    const config = loadConfig({ PORT: '8080', DB_PATH: '/data/finboard.db', JWT_SECRET: 's3gr3do' })

    expect(config).toMatchObject({ port: 8080, dbPath: '/data/finboard.db', jwtSecret: 's3gr3do' })
  })

  it('exige JWT_SECRET em produção', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('JWT_SECRET é obrigatório')
  })

  it('só confia no proxy quando TRUST_PROXY é exatamente "true"', () => {
    expect(loadConfig({ TRUST_PROXY: 'true' }).trustProxy).toBe(true)
    expect(loadConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(false)
    expect(loadConfig({ TRUST_PROXY: 'false' }).trustProxy).toBe(false)
  })
})
