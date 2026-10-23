import { describe, expect, it } from 'vitest'
import { DEV_APP_URL, DEV_JWT_SECRET, loadConfig } from '../src/config.js'

describe('loadConfig', () => {
  it('usa os padrões de desenvolvimento sem nenhuma variável', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      dbPath: 'data/finboard.db',
      jwtSecret: DEV_JWT_SECRET,
      trustProxy: false,
      appUrl: DEV_APP_URL,
      exposeMailInLogs: true,
      logLevel: 'info',
    })
  })

  it('aceita LOG_LEVEL do pino e recusa nível desconhecido', () => {
    expect(loadConfig({ LOG_LEVEL: 'debug' }).logLevel).toBe('debug')
    expect(loadConfig({ LOG_LEVEL: 'silent' }).logLevel).toBe('silent')
    expect(() => loadConfig({ LOG_LEVEL: 'verbose' })).toThrow('LOG_LEVEL inválido')
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

  it('lê a origem do SPA para os links de e-mail', () => {
    expect(loadConfig({ APP_URL: 'https://finboard.app' }).appUrl).toBe('https://finboard.app')
  })

  it('lê o token de /metrics só quando definido', () => {
    expect(loadConfig({ METRICS_TOKEN: 'scrape-123' }).metricsToken).toBe('scrape-123')
    expect(loadConfig({ METRICS_TOKEN: '' })).not.toHaveProperty('metricsToken')
  })

  it('não escreve o corpo dos e-mails no log em produção', () => {
    expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 's' }).exposeMailInLogs).toBe(false)
  })
})
