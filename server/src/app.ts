import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { openDatabase } from './db/connection.js'
import { TransactionsRepository } from './modules/transactions/repository.js'
import { registerTransactionRoutes } from './modules/transactions/routes.js'

export interface BuildAppOptions {
  dbPath: string
  logger?: boolean
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

  app.addHook('onClose', () => {
    db.close()
  })

  return app
}
