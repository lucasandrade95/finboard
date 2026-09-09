import type { FastifyInstance } from 'fastify'
import { idParamSchema } from '../transactions/schemas.js'
import type { GoalsRepository } from './repository.js'
import { contributionSchema, createGoalSchema, updateGoalSchema } from './schemas.js'

export function registerGoalRoutes(app: FastifyInstance, repository: GoalsRepository): void {
  // Metas não têm recorte de mês: valem até serem alcançadas ou removidas.
  app.get('/api/goals', async () => ({ items: repository.list() }))

  app.post('/api/goals', async (request, reply) => {
    const input = createGoalSchema.parse(request.body)
    return reply.code(201).send(repository.create(input))
  })

  app.put('/api/goals/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateGoalSchema.parse(request.body)
    const updated = repository.updateById(id, input)
    if (!updated) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return updated
  })

  // Aporte é uma ação própria, não um PUT: o cliente manda só o quanto guardou.
  app.post('/api/goals/:id/contributions', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const { amountCents } = contributionSchema.parse(request.body)
    const updated = repository.contribute(id, amountCents)
    if (!updated) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return updated
  })

  app.delete('/api/goals/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    if (!repository.deleteById(id)) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return reply.code(204).send()
  })
}
