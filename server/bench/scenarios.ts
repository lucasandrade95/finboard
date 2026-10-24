import type { Result } from 'autocannon'

/** Uma rota disparada em loop pelo autocannon, com o status que conta como acerto. */
export interface LoadScenario {
  name: string
  method: 'GET' | 'POST'
  path: string
  headers: Record<string, string>
  body?: string
  expectedStatus: number
}

export interface ScenarioContext {
  /** JWT da conta demo (sem `Bearer`). */
  token: string
  /** Mês com dados do seed (YYYY-MM). */
  month: string
  /** ETag atual do resumo do mês, para o cenário de revalidação (304). */
  summaryEtag: string
}

/**
 * O que o dashboard faz de verdade, do mais barato ao mais caro: healthcheck,
 * leitura com agregação, a mesma leitura revalidada por ETag, listagem paginada
 * e escrita (insert + auditoria numa transação, depois a checagem de orçamento).
 */
export function buildScenarios({ token, month, summaryEtag }: ScenarioContext): LoadScenario[] {
  const auth = { authorization: `Bearer ${token}` }
  return [
    { name: 'GET /health', method: 'GET', path: '/health', headers: {}, expectedStatus: 200 },
    {
      name: 'GET /api/summary',
      method: 'GET',
      path: `/api/summary?month=${month}`,
      headers: auth,
      expectedStatus: 200,
    },
    {
      name: 'GET /api/summary (304)',
      method: 'GET',
      path: `/api/summary?month=${month}`,
      headers: { ...auth, 'if-none-match': summaryEtag },
      expectedStatus: 304,
    },
    {
      name: 'GET /api/transactions',
      method: 'GET',
      path: `/api/transactions?month=${month}&limit=20`,
      headers: auth,
      expectedStatus: 200,
    },
    {
      name: 'POST /api/transactions',
      method: 'POST',
      path: '/api/transactions',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'expense',
        description: 'Café (carga)',
        amountCents: 750,
        category: 'alimentação',
        occurredOn: `${month}-15`,
      }),
      expectedStatus: 201,
    },
  ]
}

export interface ScenarioSummary {
  name: string
  requests: number
  requestsPerSecond: number
  latencyP50Ms: number
  latencyP97_5Ms: number
  latencyP99Ms: number
  /** Respostas com status diferente do esperado + erros de conexão e timeouts. */
  unexpected: number
}

/**
 * Reduz o resultado do autocannon ao que vai para a tabela. O `non2xx` dele não
 * serve de critério: o 304 da revalidação é acerto, então a conta é por status.
 */
export function summarize(scenario: LoadScenario, result: Result): ScenarioSummary {
  const stats = result.statusCodeStats ?? {}
  let expected = 0
  let answered = 0
  for (const [status, { count = 0 }] of Object.entries(stats)) {
    answered += count
    if (Number(status) === scenario.expectedStatus) expected += count
  }
  return {
    name: scenario.name,
    requests: answered,
    requestsPerSecond: Math.round(result.requests.average),
    latencyP50Ms: result.latency.p50,
    latencyP97_5Ms: result.latency.p97_5,
    latencyP99Ms: result.latency.p99,
    unexpected: answered - expected + result.errors + result.timeouts,
  }
}

/** Tabela Markdown pronta para colar no README. */
export function renderTable(rows: ScenarioSummary[]): string {
  const ms = (value: number) => `${value} ms`
  const lines = [
    '| Cenário | Req/s (média) | p50 | p97,5 | p99 | Fora do esperado |',
    '| ------- | ------------: | --: | ----: | --: | ---------------: |',
    ...rows.map(
      (row) =>
        `| ${row.name} | ${row.requestsPerSecond.toLocaleString('pt-BR')} | ` +
        `${ms(row.latencyP50Ms)} | ${ms(row.latencyP97_5Ms)} | ${ms(row.latencyP99Ms)} | ` +
        `${row.unexpected} |`,
    ),
  ]
  return lines.join('\n')
}

export interface LoadOptions {
  /** Segundos de carga por cenário. */
  duration: number
  /** Conexões simultâneas mantidas abertas. */
  connections: number
}

export const DEFAULT_LOAD_OPTIONS: LoadOptions = { duration: 10, connections: 10 }

/** Lê `--duration=N` e `--connections=N` (inteiros > 0); o resto é recusado. */
export function parseLoadOptions(argv: string[]): LoadOptions {
  const options = { ...DEFAULT_LOAD_OPTIONS }
  for (const arg of argv) {
    const match = /^--(duration|connections)=(\d+)$/.exec(arg)
    if (!match || Number(match[2]) <= 0) {
      throw new Error(`Argumento inválido: ${arg} (use --duration=N e --connections=N)`)
    }
    options[match[1] as keyof LoadOptions] = Number(match[2])
  }
  return options
}
