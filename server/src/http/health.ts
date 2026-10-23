import type { FastifyInstance, FastifySchema } from 'fastify'
import type { AppDatabase } from '../db/connection.js'

/**
 * `SELECT 1` de verdade no SQLite: pega banco fechado, arquivo sumido ou disco
 * corrompido, que um `{ status: 'ok' }` fixo deixaria passar até a primeira
 * requisição de usuário falhar.
 */
export function probeDatabase(db: AppDatabase): boolean {
  try {
    return db.prepare('SELECT 1 AS ok').get() !== undefined
  } catch {
    return false
  }
}

/**
 * Health check para o `HEALTHCHECK` do Docker e o monitoramento: 200 com o banco
 * respondendo, 503 sem ele — o orquestrador só olha o status. `no-store` porque o
 * estado é do instante; um 200 guardado em cache esconderia a queda.
 */
export function registerHealthRoute(
  app: FastifyInstance,
  db: AppDatabase,
  schema?: FastifySchema,
): void {
  app.get('/health', { schema }, async (_request, reply) => {
    const databaseUp = probeDatabase(db)
    reply.header('cache-control', 'no-store')
    return reply.code(databaseUp ? 200 : 503).send({
      status: databaseUp ? 'ok' : 'error',
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database: databaseUp ? 'ok' : 'error' },
    })
  })
}
