import type { FastifyInstance } from 'fastify'
import type { AccountsRepository } from '../accounts/repository.js'
import { ownerId, protectedRoute } from '../auth/authenticate.js'
import { installmentDocs } from '../../docs/schemas.js'
import { idParamSchema } from '../transactions/schemas.js'
import type { InstallmentsRepository } from './repository.js'
import { createInstallmentSchema } from './schemas.js'

export function registerInstallmentRoutes(
  app: FastifyInstance,
  repository: InstallmentsRepository,
  accounts: AccountsRepository,
): void {
  // Sem filtro de mês: um parcelamento atravessa vários meses e é listado inteiro.
  app.get(
    '/api/installments',
    { ...protectedRoute, schema: installmentDocs.list },
    async (request) => ({ items: repository.list(ownerId(request)) }),
  )

  app.post(
    '/api/installments',
    { ...protectedRoute, schema: installmentDocs.create },
    async (request, reply) => {
      const input = createInstallmentSchema.parse(request.body)
      const userId = ownerId(request)
      // Mesmo 400 de `accountId` da transação: não distingue inexistente de alheia.
      if (input.accountId !== null && !accounts.belongsTo(userId, input.accountId)) {
        return reply.code(400).send({
          error: 'validation_error',
          issues: [{ path: 'accountId', message: 'conta não encontrada' }],
        })
      }
      return reply.code(201).send(repository.create(userId, input))
    },
  )

  app.delete(
    '/api/installments/:id',
    { ...protectedRoute, schema: installmentDocs.remove },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params)
      if (!repository.deleteById(ownerId(request), id)) {
        return reply.code(404).send({ error: 'not_found' })
      }
      return reply.code(204).send()
    },
  )
}
