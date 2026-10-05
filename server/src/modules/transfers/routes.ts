import type { FastifyInstance } from 'fastify'
import type { AccountsRepository } from '../accounts/repository.js'
import { ownerId, protectedRoute } from '../auth/authenticate.js'
import { transferDocs } from '../../docs/schemas.js'
import { idParamSchema, monthQuerySchema } from '../transactions/schemas.js'
import type { TransfersRepository } from './repository.js'
import { createTransferSchema } from './schemas.js'

export function registerTransferRoutes(
  app: FastifyInstance,
  repository: TransfersRepository,
  accounts: AccountsRepository,
): void {
  app.get('/api/transfers', { ...protectedRoute, schema: transferDocs.list }, async (request) => {
    const { month } = monthQuerySchema.parse(request.query)
    return { items: repository.list(ownerId(request), month) }
  })

  app.post(
    '/api/transfers',
    { ...protectedRoute, schema: transferDocs.create },
    async (request, reply) => {
      const input = createTransferSchema.parse(request.body)
      const userId = ownerId(request)
      // Mesmo formato do 400 de `accountId` na transação: não distingue conta
      // inexistente de conta de outra pessoa.
      const issues = (['fromAccountId', 'toAccountId'] as const)
        .filter((field) => !accounts.belongsTo(userId, input[field]))
        .map((path) => ({ path, message: 'conta não encontrada' }))
      if (issues.length > 0) {
        return reply.code(400).send({ error: 'validation_error', issues })
      }
      return reply.code(201).send(repository.create(userId, input))
    },
  )

  app.delete(
    '/api/transfers/:id',
    { ...protectedRoute, schema: transferDocs.remove },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params)
      if (!repository.deleteById(ownerId(request), id)) {
        return reply.code(404).send({ error: 'not_found' })
      }
      return reply.code(204).send()
    },
  )
}
