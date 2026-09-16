import type { FastifyInstance } from 'fastify'
import { ownerId, protectedRoute } from '../auth/authenticate.js'
import { requiredMonthQuerySchema } from '../transactions/schemas.js'
import type { BudgetsRepository } from './repository.js'
import { budgetCategoryParamSchema, upsertBudgetSchema } from './schemas.js'

export function registerBudgetRoutes(app: FastifyInstance, repository: BudgetsRepository): void {
  // Progresso depende do gasto de um mês concreto: mês obrigatório.
  app.get('/api/budgets', protectedRoute, async (request) => {
    const { month } = requiredMonthQuerySchema.parse(request.query)
    return repository.progressForMonth(ownerId(request), month)
  })

  // PUT com upsert: definir e ajustar orçamento são a mesma ação para o usuário.
  app.put('/api/budgets/:category', protectedRoute, async (request) => {
    const { category } = budgetCategoryParamSchema.parse(request.params)
    const { amountCents } = upsertBudgetSchema.parse(request.body)
    return repository.upsert(ownerId(request), category, amountCents)
  })

  app.delete('/api/budgets/:category', protectedRoute, async (request, reply) => {
    const { category } = budgetCategoryParamSchema.parse(request.params)
    // Categoria orçada por outra conta cai aqui: o 404 não confirma que existe.
    if (!repository.deleteByCategory(ownerId(request), category)) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return reply.code(204).send()
  })
}
