import type { FastifyInstance } from 'fastify'
import { ownerId, protectedRoute } from '../auth/authenticate.js'
import { idParamSchema } from '../transactions/schemas.js'
import type { GoalsRepository } from './repository.js'
import { contributionSchema, createGoalSchema, updateGoalSchema } from './schemas.js'

export function registerGoalRoutes(app: FastifyInstance, repository: GoalsRepository): void {
  // Metas não têm recorte de mês: valem até serem alcançadas ou removidas.
  app.get('/api/goals', protectedRoute, async (request) => ({
    items: repository.list(ownerId(request)),
  }))

  app.post('/api/goals', protectedRoute, async (request, reply) => {
    const input = createGoalSchema.parse(request.body)
    return reply.code(201).send(repository.create(ownerId(request), input))
  })

  app.put('/api/goals/:id', protectedRoute, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateGoalSchema.parse(request.body)
    const updated = repository.updateById(ownerId(request), id, input)
    // Meta de outra conta cai aqui: o 404 não confirma que o id existe.
    if (!updated) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return updated
  })

  // Aporte é uma ação própria, não um PUT: o cliente manda só o quanto guardou.
  app.post('/api/goals/:id/contributions', protectedRoute, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const { amountCents } = contributionSchema.parse(request.body)
    const updated = repository.contribute(ownerId(request), id, amountCents)
    if (!updated) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return updated
  })

  app.delete('/api/goals/:id', protectedRoute, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    if (!repository.deleteById(ownerId(request), id)) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return reply.code(204).send()
  })
}
