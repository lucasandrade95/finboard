import type { FastifyInstance } from 'fastify'
import { projectionDocs } from '../../docs/schemas.js'
import { ownerId, protectedRoute } from '../auth/authenticate.js'
import type { ProjectionRepository } from './repository.js'
import { projectionQuerySchema } from './schemas.js'

// Data local, não UTC: sem `from`, "hoje" segue o relógio do servidor.
function today(): string {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

export function registerProjectionRoutes(
  app: FastifyInstance,
  repository: ProjectionRepository,
): void {
  app.get('/api/projection', { ...protectedRoute, schema: projectionDocs.get }, async (request) => {
    const { from, days } = projectionQuerySchema.parse(request.query)
    return repository.project(ownerId(request), from ?? today(), days)
  })
}
