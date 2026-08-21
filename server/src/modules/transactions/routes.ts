import type { FastifyInstance } from 'fastify'
import type { TransactionsRepository } from './repository.js'
import { createTransactionSchema, idParamSchema, monthQuerySchema } from './schemas.js'

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

  app.delete('/api/transactions/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    if (!repository.deleteById(id)) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return reply.code(204).send()
  })

  app.get('/api/summary', async (request) => {
    const { month } = monthQuerySchema.parse(request.query)
    return repository.summaryByMonth(month)
  })
}
