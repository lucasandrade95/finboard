import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp, type BuildAppOptions } from '../src/app.js'
import type { LogLevel } from '../src/config.js'
import { resolveRequestId, sqlFingerprint } from '../src/http/request-context.js'

const OWNER = { email: 'lucas@example.com', password: 'senha-forte-123' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

interface LogLine {
  level: number
  msg: string
  reqId?: string
  sql?: string
  [key: string]: unknown
}

let app: FastifyInstance | undefined
let lines: LogLine[] = []

async function build(level: LogLevel = 'info', extra: Partial<BuildAppOptions> = {}) {
  lines = []
  app = await buildApp({
    dbPath: ':memory:',
    rateLimit: false,
    logger: { level, stream: { write: (line) => lines.push(JSON.parse(line) as LogLine) } },
    ...extra,
  })
  app.get('/boom', async () => {
    throw new Error('falha inesperada com detalhe interno')
  })
  await app.ready()
  return app
}

afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('resolveRequestId', () => {
  it('reaproveita id curto e seguro vindo de fora', () => {
    expect(resolveRequestId('abc-123_x.y:z')).toBe('abc-123_x.y:z')
  })

  it('gera UUID quando falta, é lista, longo demais ou tem caractere estranho', () => {
    for (const header of [undefined, '', ['a', 'b'], 'x'.repeat(65), 'a b', 'a"}{', 'a\nb']) {
      expect(resolveRequestId(header)).toMatch(UUID)
    }
  })
})

describe('sqlFingerprint', () => {
  it('troca textos, blobs e números por ? e mantém a forma da consulta', () => {
    expect(
      sqlFingerprint(
        "INSERT INTO users (email, password_hash) VALUES ('lucas@example.com', '$argon2id$v=19$m')",
      ),
    ).toBe('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    expect(sqlFingerprint("SELECT * FROM t1 WHERE id = 42 AND v = -3.5 AND b = x'0aff'")).toBe(
      'SELECT * FROM t1 WHERE id = ? AND v = ? AND b = ?',
    )
  })

  it('trata aspas escapadas dentro do texto e colapsa espaços', () => {
    expect(sqlFingerprint("SELECT 'it''s'\n   FROM x")).toBe('SELECT ? FROM x')
  })

  it('remove a anotação que o SQLite põe ao cortar texto longo', () => {
    expect(sqlFingerprint("UPDATE t SET h = 'abcdef'/*+40 bytes*/ WHERE id = 7")).toBe(
      'UPDATE t SET h = ? WHERE id = ?',
    )
  })
})

describe('request id', () => {
  it('toda resposta sai com X-Request-Id, um UUID novo por requisição', async () => {
    await build()

    const first = await app!.inject({ method: 'GET', url: '/health' })
    const second = await app!.inject({ method: 'GET', url: '/health' })

    expect(first.headers['x-request-id']).toMatch(UUID)
    expect(second.headers['x-request-id']).toMatch(UUID)
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id'])
  })

  it('reaproveita o X-Request-Id recebido e descarta o inseguro', async () => {
    await build()

    const kept = await app!.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'nginx-7f3a' },
    })
    const replaced = await app!.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': '<script>' },
    })

    expect(kept.headers['x-request-id']).toBe('nginx-7f3a')
    expect(replaced.headers['x-request-id']).toMatch(UUID)
  })

  it('as linhas de log da requisição levam o mesmo reqId do header', async () => {
    await build()

    const response = await app!.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'req-health-1' },
    })

    expect(response.headers['x-request-id']).toBe('req-health-1')
    const tagged = lines.filter((line) => line.reqId === 'req-health-1')
    expect(tagged.map((line) => line.msg)).toEqual(['incoming request', 'request completed'])
  })

  it('o 429 do rate limit também sai com o id', async () => {
    await build('info', { rateLimit: { max: 1, authMax: 1, timeWindow: 60_000 } })

    await app!.inject({ method: 'GET', url: '/health' })
    const limited = await app!.inject({ method: 'GET', url: '/health' })

    expect(limited.statusCode).toBe(429)
    expect(limited.headers['x-request-id']).toMatch(UUID)
  })

  it('erro 500 devolve o requestId e loga o detalhe só no servidor, com o mesmo id', async () => {
    await build()

    const response = await app!.inject({ method: 'GET', url: '/boom' })

    expect(response.statusCode).toBe(500)
    const requestId = response.headers['x-request-id']
    expect(response.json()).toEqual({ error: 'internal_error', requestId })
    expect(response.body).not.toContain('detalhe interno')
    const errorLine = lines.find((line) => line.level === 50)
    expect(errorLine?.reqId).toBe(requestId)
    expect(JSON.stringify(errorLine)).toContain('falha inesperada com detalhe interno')
  })
})

describe('SQL no log com o id da requisição', () => {
  it('em debug, cada consulta do repositório sai com o reqId e sem os valores', async () => {
    await build('debug')

    const response = await app!.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: OWNER,
      headers: { 'x-request-id': 'req-register-1' },
    })

    expect(response.statusCode).toBe(201)
    const sql = lines.filter((line) => line.msg === 'sql')
    expect(sql.length).toBeGreaterThan(0)
    expect(sql.every((line) => line.reqId === 'req-register-1')).toBe(true)
    expect(sql.map((line) => line.sql)).toContain(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
    )
    const all = lines.map((line) => JSON.stringify(line)).join('\n')
    expect(all).not.toContain(OWNER.email)
    expect(all).not.toContain('$argon2')
  })

  it('consultas de requisições diferentes não se misturam', async () => {
    await build('debug')

    await app!.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: OWNER,
      headers: { 'x-request-id': 'req-a' },
    })
    await app!.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: OWNER,
      headers: { 'x-request-id': 'req-b' },
    })

    const sql = lines.filter((line) => line.msg === 'sql')
    expect(new Set(sql.map((line) => line.reqId))).toEqual(new Set(['req-a', 'req-b']))
    expect(sql.filter((line) => line.reqId === 'req-b').map((line) => line.sql)).toContainEqual(
      expect.stringContaining('FROM users'),
    )
  })

  it('migrações do boot não geram linha de SQL (não há requisição)', async () => {
    await build('debug')

    expect(lines.some((line) => line.msg === 'sql')).toBe(false)
  })

  it('em info não loga SQL nenhum', async () => {
    await build('info')

    await app!.inject({ method: 'POST', url: '/api/auth/register', payload: OWNER })

    expect(lines.some((line) => line.msg === 'sql')).toBe(false)
  })
})
