import type { Result } from 'autocannon'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runLoadTest, runScenario, startTarget, type LoadTarget } from '../bench/runner.js'
import {
  buildScenarios,
  DEFAULT_LOAD_OPTIONS,
  parseLoadOptions,
  renderTable,
  summarize,
  type LoadScenario,
} from '../bench/scenarios.js'

const CONTEXT = { token: 'abc', month: '2026-09', summaryEtag: '"etag-1"' }

function fakeResult(
  statusCodeStats: Record<string, { count: number }>,
  extra: Partial<Result> = {},
): Result {
  const histogram = { average: 1234.4, p50: 3, p97_5: 9, p99: 12 }
  return {
    statusCodeStats,
    requests: histogram,
    latency: histogram,
    errors: 0,
    timeouts: 0,
    ...extra,
  } as unknown as Result
}

function scenario(name: string, context = CONTEXT): LoadScenario {
  const found = buildScenarios(context).find((s) => s.name === name)
  if (!found) throw new Error(`cenário inexistente: ${name}`)
  return found
}

describe('cenários de carga', () => {
  it('autentica as rotas da API, revalida o resumo com o ETag e deixa /health aberto', () => {
    expect(scenario('GET /health').headers).toEqual({})
    expect(scenario('GET /api/summary').headers.authorization).toBe('Bearer abc')
    expect(scenario('GET /api/summary (304)')).toMatchObject({
      path: '/api/summary?month=2026-09',
      headers: { 'if-none-match': '"etag-1"' },
      expectedStatus: 304,
    })
  })

  it('escreve uma despesa válida, em centavos inteiros, dentro do mês medido', () => {
    const post = scenario('POST /api/transactions')
    const body = JSON.parse(post.body ?? '{}')

    expect(post.expectedStatus).toBe(201)
    expect(Number.isInteger(body.amountCents)).toBe(true)
    expect(body.occurredOn).toBe('2026-09-15')
  })

  it('conta o 304 como acerto e qualquer outro status, erro ou timeout como falha', () => {
    const row = summarize(
      scenario('GET /api/summary (304)'),
      fakeResult({ '304': { count: 90 }, '200': { count: 7 } }, { errors: 2, timeouts: 1 }),
    )

    expect(row).toEqual({
      name: 'GET /api/summary (304)',
      requests: 97,
      requestsPerSecond: 1234,
      latencyP50Ms: 3,
      latencyP97_5Ms: 9,
      latencyP99Ms: 12,
      unexpected: 10,
    })
  })

  it('gera a tabela Markdown do README com milhar em pt-BR', () => {
    const table = renderTable([
      summarize(
        scenario('GET /health'),
        fakeResult({ '200': { count: 5 } }, { requests: { average: 15320 } as never }),
      ),
    ])

    expect(table.split('\n')).toEqual([
      '| Cenário | Req/s (média) | p50 | p97,5 | p99 | Fora do esperado |',
      '| ------- | ------------: | --: | ----: | --: | ---------------: |',
      '| GET /health | 15.320 | 3 ms | 9 ms | 12 ms | 0 |',
    ])
  })

  it('lê duração e conexões da linha de comando e recusa o resto', () => {
    expect(parseLoadOptions([])).toEqual(DEFAULT_LOAD_OPTIONS)
    expect(parseLoadOptions(['--duration=3', '--connections=50'])).toEqual({
      duration: 3,
      connections: 50,
    })
    expect(() => parseLoadOptions(['--duration=0'])).toThrow('Argumento inválido')
    expect(() => parseLoadOptions(['--conexoes=5'])).toThrow('Argumento inválido')
  })
})

describe('carga contra a API real', () => {
  let target: LoadTarget
  const options = { ...DEFAULT_LOAD_OPTIONS, connections: 2, amount: 40 }

  beforeAll(async () => {
    target = await startTarget('2026-09-27')
  })

  afterAll(async () => {
    await target.close()
  })

  it('roda todos os cenários sobre HTTP sem nenhuma resposta fora do esperado', async () => {
    const rows = await runLoadTest(target, options)

    expect(rows.map((row) => row.name)).toEqual(buildScenarios(CONTEXT).map((s) => s.name))
    for (const row of rows) {
      expect(row, row.name).toMatchObject({ requests: 40, unexpected: 0 })
    }
  })

  it('denuncia a medição quando a rota responde outra coisa (token inválido → 401)', async () => {
    const summary = scenario('GET /api/summary', {
      ...target,
      token: 'token-invalido',
      summaryEtag: '',
    })
    const row = await runScenario(target.url, summary, options)

    expect(row.unexpected).toBe(40)
  })
})
