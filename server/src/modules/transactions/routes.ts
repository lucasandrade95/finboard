import type { FastifyInstance } from 'fastify'
import type { TransactionsRepository } from './repository.js'
import {
  createTransactionSchema,
  idParamSchema,
  listTransactionsQuerySchema,
  monthQuerySchema,
  updateTransactionSchema,
} from './schemas.js'

export function registerTransactionRoutes(
  app: FastifyInstance,
  repository: TransactionsRepository,
): void {
  app.get('/api/transactions', async (request) => {
    const { month, type, category, q, limit, offset } = listTransactionsQuerySchema.parse(
      request.query,
    )
    const { items, total } = repository.list({ month, type, category, q, limit, offset })
    return { items, total, limit, offset }
  })

  app.post('/api/transactions', async (request, reply) => {
    const input = createTransactionSchema.parse(request.body)
    const created = repository.create(input)
    return reply.code(201).send(created)
  })

  app.put('/api/transactions/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateTransactionSchema.parse(request.body)
    const updated = repository.updateById(id, input)
    if (!updated) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return updated
  })

  app.delete('/api/transactions/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    if (!repository.deleteById(id)) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return reply.code(204).send()
  })

  app.get('/api/categories', async (request) => {
    const { month } = monthQuerySchema.parse(request.query)
    return { categories: repository.listCategories(month) }
  })

  app.get('/api/expenses-by-category', async (request) => {
    const { month } = monthQuerySchema.parse(request.query)
    return repository.expensesByCategory(month)
  })

  app.get('/api/summary', async (request) => {
    const { month } = monthQuerySchema.parse(request.query)
    return repository.summaryByMonth(month)
  })
}
