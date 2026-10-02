import type { FastifyInstance, FastifyReply } from 'fastify'
import { ownerId, protectedRoute } from '../auth/authenticate.js'
import { accountDocs } from '../../docs/schemas.js'
import { idParamSchema } from '../transactions/schemas.js'
import type { AccountsRepository, AccountWriteResult } from './repository.js'
import { createAccountSchema, updateAccountSchema } from './schemas.js'

function sendWriteResult(reply: FastifyReply, result: AccountWriteResult, successCode: number) {
  if (result.status === 'conflict') {
    return reply.code(409).send({ error: 'account_exists' })
  }
  // Conta de outro usuário cai aqui: o 404 não confirma que o id existe.
  if (result.status === 'not_found') {
    return reply.code(404).send({ error: 'not_found' })
  }
  return reply.code(successCode).send(result.account)
}

export function registerAccountRoutes(app: FastifyInstance, repository: AccountsRepository): void {
  app.get('/api/accounts', { ...protectedRoute, schema: accountDocs.list }, async (request) => ({
    items: repository.list(ownerId(request)),
  }))

  app.post(
    '/api/accounts',
    { ...protectedRoute, schema: accountDocs.create },
    async (request, reply) => {
      const input = createAccountSchema.parse(request.body)
      return sendWriteResult(reply, repository.create(ownerId(request), input), 201)
    },
  )

  app.put(
    '/api/accounts/:id',
    { ...protectedRoute, schema: accountDocs.update },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params)
      const input = updateAccountSchema.parse(request.body)
      return sendWriteResult(reply, repository.updateById(ownerId(request), id, input), 200)
    },
  )

  app.delete(
    '/api/accounts/:id',
    { ...protectedRoute, schema: accountDocs.remove },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params)
      if (!repository.deleteById(ownerId(request), id)) {
        return reply.code(404).send({ error: 'not_found' })
      }
      return reply.code(204).send()
    },
  )
}
