import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import argon2 from 'argon2'
import autocannon from 'autocannon'
import { buildApp } from '../src/app.js'
import { openDatabase } from '../src/db/connection.js'
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from '../src/db/seed.js'
import {
  buildScenarios,
  summarize,
  type LoadOptions,
  type LoadScenario,
  type ScenarioSummary,
} from './scenarios.js'

export interface LoadTarget {
  url: string
  token: string
  month: string
  close(): Promise<void>
}

/**
 * Sobe a API de verdade (HTTP numa porta livre, banco em arquivo) com os dados
 * da demo, para a carga passar pelo mesmo caminho de produção: socket, helmet,
 * JWT, ETag, métricas e SQLite em disco. Só o rate limit fica desligado — com
 * ele, o teto de 300/min responderia 429 no primeiro segundo e mediria o limitador.
 */
export async function startTarget(today: string): Promise<LoadTarget> {
  const dir = mkdtempSync(join(tmpdir(), 'finboard-load-'))
  const dbPath = join(dir, 'load.db')
  const db = openDatabase(dbPath)
  try {
    seedDemo(db, { passwordHash: await argon2.hash(DEMO_PASSWORD), today })
  } finally {
    db.close()
  }

  const month = today.slice(0, 7)
  const app = await buildApp({ dbPath, recurringMonth: month, rateLimit: false })
  const url = await app.listen({ port: 0, host: '127.0.0.1' })
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  })

  return {
    url,
    token: login.json<{ token: string }>().token,
    month,
    async close() {
      await app.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

export interface RunOptions extends LoadOptions {
  /** Total fixo de requisições por cenário no lugar da duração (testes). */
  amount?: number
}

export async function runScenario(
  url: string,
  scenario: LoadScenario,
  options: RunOptions,
): Promise<ScenarioSummary> {
  const result = await autocannon({
    url: `${url}${scenario.path}`,
    method: scenario.method,
    headers: scenario.headers,
    body: scenario.body,
    connections: options.connections,
    duration: options.duration,
    amount: options.amount,
  })
  return summarize(scenario, result)
}

/**
 * Roda os cenários um depois do outro (nunca juntos: cada linha da tabela mede
 * uma rota sozinha). O ETag do 304 é lido na hora, do mesmo resumo que vai ser
 * revalidado — por isso o cenário de escrita vem por último.
 */
export async function runLoadTest(
  target: Pick<LoadTarget, 'url' | 'token' | 'month'>,
  options: RunOptions,
): Promise<ScenarioSummary[]> {
  const summary = await fetch(`${target.url}/api/summary?month=${target.month}`, {
    headers: { authorization: `Bearer ${target.token}` },
  })
  const summaryEtag = summary.headers.get('etag') ?? ''

  const rows: ScenarioSummary[] = []
  for (const scenario of buildScenarios({ ...target, summaryEtag })) {
    rows.push(await runScenario(target.url, scenario, options))
  }
  return rows
}
