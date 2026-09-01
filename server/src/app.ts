import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { openDatabase } from './db/connection.js'
import { TransactionsRepository } from './modules/transactions/repository.js'
import { registerTransactionRoutes } from './modules/transactions/routes.js'

export interface BuildAppOptions {
  dbPath: string
  logger?: boolean
  /** Mês alvo da geração de recorrentes no boot (YYYY-MM); default: mês atual. Testes injetam. */
  recurringMonth?: string
}

// Mês local, não UTC: a virada de mês deve seguir o relógio do usuário.
function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false })
  const db = openDatabase(options.dbPath)

  await app.register(cors, { origin: true })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'validation_error',
        issues: error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      })
    }
    request.log.error(error)
    const fastifyError = error as { statusCode?: number; message?: string }
    const statusCode =
      typeof fastifyError.statusCode === 'number' && fastifyError.statusCode >= 400
        ? fastifyError.statusCode
        : 500
    return reply
      .code(statusCode)
      .send({ error: statusCode >= 500 ? 'internal_error' : (fastifyError.message ?? 'erro') })
  })

  app.get('/health', async () => ({ status: 'ok' }))

  const repository = new TransactionsRepository(db)
  registerTransactionRoutes(app, repository)

  const generated = repository.generateRecurringForMonth(options.recurringMonth ?? currentMonth())
  if (generated.length > 0) {
    app.log.info({ count: generated.length }, 'transações recorrentes geradas para o mês')
  }

  app.addHook('onClose', () => {
    db.close()
  })

  return app
}
