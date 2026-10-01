import type { FastifyInstance, FastifyReply } from 'fastify'
import { ownerId, protectedRoute } from '../auth/authenticate.js'
import { categoryDocs } from '../../docs/schemas.js'
import { idParamSchema } from '../transactions/schemas.js'
import type { CategoriesRepository, CategoryWriteResult } from './repository.js'
import { createCategorySchema, updateCategorySchema } from './schemas.js'

function sendWriteResult(reply: FastifyReply, result: CategoryWriteResult, successCode: number) {
  if (result.status === 'conflict') {
    return reply.code(409).send({ error: 'category_exists' })
  }
  // Categoria de outra conta cai aqui: o 404 não confirma que o id existe.
  if (result.status === 'not_found') {
    return reply.code(404).send({ error: 'not_found' })
  }
  return reply.code(successCode).send(result.category)
}

/**
 * O catálogo mora em `/api/categories/catalog` porque `/api/categories` já é a
 * lista de nomes distintos usados no mês (filtro e sugestões) e segue igual.
 */
export function registerCategoryRoutes(
  app: FastifyInstance,
  repository: CategoriesRepository,
): void {
  app.get(
    '/api/categories/catalog',
    { ...protectedRoute, schema: categoryDocs.list },
    async (request) => ({ items: repository.list(ownerId(request)) }),
  )

  app.post(
    '/api/categories/catalog',
    { ...protectedRoute, schema: categoryDocs.create },
    async (request, reply) => {
      const input = createCategorySchema.parse(request.body)
      return sendWriteResult(reply, repository.create(ownerId(request), input), 201)
    },
  )

  app.put(
    '/api/categories/catalog/:id',
    { ...protectedRoute, schema: categoryDocs.update },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params)
      const input = updateCategorySchema.parse(request.body)
      return sendWriteResult(reply, repository.updateById(ownerId(request), id, input), 200)
    },
  )

  app.delete(
    '/api/categories/catalog/:id',
    { ...protectedRoute, schema: categoryDocs.remove },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params)
      if (!repository.deleteById(ownerId(request), id)) {
        return reply.code(404).send({ error: 'not_found' })
      }
      return reply.code(204).send()
    },
  )
}
