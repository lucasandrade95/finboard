import type { FastifyInstance } from 'fastify'
import Fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp, type BuildAppOptions } from '../src/app.js'
import { openDatabase } from '../src/db/connection.js'
import { probeDatabase, registerHealthRoute } from '../src/http/health.js'
import { MetricsRegistry, bearerMatches } from '../src/http/metrics.js'

const OWNER = { email: 'lucas@example.com', password: 'senha-forte-123' }

let app: FastifyInstance | undefined

async function build(extra: Partial<BuildAppOptions> = {}) {
  app = await buildApp({ dbPath: ':memory:', rateLimit: false, ...extra })
  await app.ready()
  return app
}

async function scrape(instance: FastifyInstance, headers: Record<string, string> = {}) {
  return instance.inject({ method: 'GET', url: '/metrics', headers })
}

/** Valor de uma série exata (nome + labels) no texto do Prometheus. */
function sample(text: string, series: string): number | undefined {
  const line = text.split('\n').find((l) => l.startsWith(`${series} `))
  return line === undefined ? undefined : Number(line.slice(series.length + 1))
}

afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('GET /health', () => {
  it('confere o banco e devolve uptime sem cache nem ETag', async () => {
    const instance = await build()
    const response = await instance.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'ok',
      uptimeSeconds: expect.any(Number),
      checks: { database: 'ok' },
    })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers.etag).toBeUndefined()
  })

  it('responde 503 quando o banco não responde', async () => {
    const db = openDatabase(':memory:')
    const instance = Fastify()
    registerHealthRoute(instance, db)
    await instance.ready()
    db.close()

    const response = await instance.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ status: 'error', checks: { database: 'error' } })
    await instance.close()
  })
})

describe('probeDatabase', () => {
  it('é true com o banco aberto e false depois de fechado', () => {
    const db = openDatabase(':memory:')
    expect(probeDatabase(db)).toBe(true)
    db.close()
    expect(probeDatabase(db)).toBe(false)
  })
})

describe('GET /metrics', () => {
  it('expõe o formato de texto do Prometheus sem cache', async () => {
    const instance = await build()
    const response = await scrape(instance)

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('text/plain; version=0.0.4; charset=utf-8')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body).toContain('# TYPE finboard_http_requests_total counter')
    expect(response.body).toContain('# TYPE finboard_http_request_duration_seconds histogram')
    expect(sample(response.body, 'finboard_db_up')).toBe(1)
    expect(sample(response.body, 'finboard_process_uptime_seconds')).toBeGreaterThanOrEqual(0)
    expect(sample(response.body, 'finboard_nodejs_heap_used_bytes')).toBeGreaterThan(0)
  })

  it('conta por método, molde da rota e status — nunca pela URL com id', async () => {
    const instance = await build()
    const register = await instance.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: OWNER,
    })
    const authorization = `Bearer ${register.json().token}`
    await instance.inject({
      method: 'DELETE',
      url: '/api/transactions/41',
      headers: { authorization },
    })
    await instance.inject({
      method: 'DELETE',
      url: '/api/transactions/42',
      headers: { authorization },
    })
    await instance.inject({ method: 'DELETE', url: '/api/transactions/1' })
    await instance.inject({ method: 'GET', url: '/nao-existe/123' })

    const { body } = await scrape(instance)

    expect(
      sample(
        body,
        'finboard_http_requests_total{method="POST",route="/api/auth/register",status="201"}',
      ),
    ).toBe(1)
    expect(
      sample(
        body,
        'finboard_http_requests_total{method="DELETE",route="/api/transactions/:id",status="404"}',
      ),
    ).toBe(2)
    expect(
      sample(
        body,
        'finboard_http_requests_total{method="DELETE",route="/api/transactions/:id",status="401"}',
      ),
    ).toBe(1)
    expect(
      sample(body, 'finboard_http_requests_total{method="GET",route="unmatched",status="404"}'),
    ).toBe(1)
    expect(body).not.toContain('/api/transactions/42')
    expect(body).not.toContain('/nao-existe')
    expect(
      sample(
        body,
        'finboard_http_request_duration_seconds_count{method="DELETE",route="/api/transactions/:id"}',
      ),
    ).toBe(3)
  })

  it('conta o 429 do rate limit e o scrape não entra no limite', async () => {
    const instance = await build({ rateLimit: { max: 1, authMax: 1, timeWindow: '1 minute' } })
    await instance.inject({ method: 'GET', url: '/health' })
    await instance.inject({ method: 'GET', url: '/health' })

    await scrape(instance)
    const { statusCode, body } = await scrape(instance)

    expect(statusCode).toBe(200)
    expect(
      sample(body, 'finboard_http_requests_total{method="GET",route="/health",status="200"}'),
    ).toBe(1)
    expect(
      sample(body, 'finboard_http_requests_total{method="GET",route="/health",status="429"}'),
    ).toBe(1)
  })

  it('com METRICS_TOKEN exige o bearer certo', async () => {
    const instance = await build({ metricsToken: 'scrape-123' })

    expect((await scrape(instance)).statusCode).toBe(401)
    expect((await scrape(instance, { authorization: 'Bearer outro' })).statusCode).toBe(401)
    const ok = await scrape(instance, { authorization: 'Bearer scrape-123' })
    expect(ok.statusCode).toBe(200)
    expect(ok.body).toContain('finboard_db_up 1')
  })
})

describe('MetricsRegistry', () => {
  it('acumula os baldes do histograma e fecha com +Inf, soma e contagem', () => {
    const registry = new MetricsRegistry()
    registry.observe('GET', '/api/summary', 200, 0.003)
    registry.observe('GET', '/api/summary', 200, 0.2)
    registry.observe('GET', '/api/summary', 200, 9)

    const text = registry.render([])
    const series = (le: string) =>
      sample(
        text,
        `finboard_http_request_duration_seconds_bucket{method="GET",route="/api/summary",le="${le}"}`,
      )

    expect(series('0.005')).toBe(1)
    expect(series('0.1')).toBe(1)
    expect(series('0.25')).toBe(2)
    expect(series('5')).toBe(2)
    expect(series('+Inf')).toBe(3)
    expect(
      sample(
        text,
        'finboard_http_request_duration_seconds_count{method="GET",route="/api/summary"}',
      ),
    ).toBe(3)
    expect(
      sample(text, 'finboard_http_request_duration_seconds_sum{method="GET",route="/api/summary"}'),
    ).toBeCloseTo(9.203)
  })

  it('escapa aspas, barra invertida e quebra de linha nos labels', () => {
    const registry = new MetricsRegistry()
    registry.observe('GET', 'a"b\\c\nd', 200, 0.01)

    expect(registry.render([])).toContain('route="a\\"b\\\\c\\nd"')
  })
})

describe('bearerMatches', () => {
  it('só aceita exatamente "Bearer <token>"', () => {
    expect(bearerMatches('Bearer s3gr3do', 's3gr3do')).toBe(true)
    expect(bearerMatches('Bearer s3gr3do-mais', 's3gr3do')).toBe(false)
    expect(bearerMatches('s3gr3do', 's3gr3do')).toBe(false)
    expect(bearerMatches(undefined, 's3gr3do')).toBe(false)
  })
})
