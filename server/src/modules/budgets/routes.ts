import type { FastifyInstance } from 'fastify'
import { requiredMonthQuerySchema } from '../transactions/schemas.js'
import type { BudgetsRepository } from './repository.js'
import { budgetCategoryParamSchema, upsertBudgetSchema } from './schemas.js'

export function registerBudgetRoutes(app: FastifyInstance, repository: BudgetsRepository): void {
  // Progresso depende do gasto de um mês concreto: mês obrigatório.
  app.get('/api/budgets', async (request) => {
    const { month } = requiredMonthQuerySchema.parse(request.query)
    return repository.progressForMonth(month)
  })

  // PUT com upsert: definir e ajustar orçamento são a mesma ação para o usuário.
  app.put('/api/budgets/:category', async (request) => {
    const { category } = budgetCategoryParamSchema.parse(request.params)
    const { amountCents } = upsertBudgetSchema.parse(request.body)
    return repository.upsert(category, amountCents)
  })

  app.delete('/api/budgets/:category', async (request, reply) => {
    const { category } = budgetCategoryParamSchema.parse(request.params)
    if (!repository.deleteByCategory(category)) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return reply.code(204).send()
  })
}
