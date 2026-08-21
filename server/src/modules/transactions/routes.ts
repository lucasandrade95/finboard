import type { FastifyInstance } from 'fastify'
import type { TransactionsRepository } from './repository.js'
import { createTransactionSchema, monthQuerySchema } from './schemas.js'

export function registerTransactionRoutes(
  app: FastifyInstance,
  repository: TransactionsRepository,
): void {
  app.get('/api/transactions', async (request) => {
    const { month } = monthQuerySchema.parse(request.query)
    return repository.listByMonth(month)
  })

  app.post('/api/transactions', async (request, reply) => {
    const input = createTransactionSchema.parse(request.body)
    const created = repository.create(input)
    return reply.code(201).send(created)
  })

  app.get('/api/summary', async (request) => {
    const { month } = monthQuerySchema.parse(request.query)
    return repository.summaryByMonth(month)
  })
}
