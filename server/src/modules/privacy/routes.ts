import argon2 from 'argon2'
import type { FastifyInstance } from 'fastify'
import { privacyDocs } from '../../docs/schemas.js'
import { ownerId, protectedRoute } from '../auth/authenticate.js'
import type { UsersRepository } from '../auth/repository.js'
import type { PrivacyRepository } from './repository.js'
import { deleteAccountSchema } from './schemas.js'

export interface PrivacyRateLimit {
  max: number
  timeWindow: number | string
}

export function registerPrivacyRoutes(
  app: FastifyInstance,
  privacy: PrivacyRepository,
  users: UsersRepository,
  rateLimit?: PrivacyRateLimit,
): void {
  app.get(
    '/api/auth/me/export',
    { ...protectedRoute, schema: privacyDocs.exportData },
    async (request, reply) => {
      const data = privacy.exportUserData(ownerId(request))
      if (!data) {
        return reply.code(401).send({ error: 'unauthorized' })
      }
      const day = data.exportedAt.slice(0, 10)
      return (
        reply
          .header('content-type', 'application/json; charset=utf-8')
          .header('content-disposition', `attachment; filename="finboard-meus-dados-${day}.json"`)
          .header('cache-control', 'private, no-store')
          // Indentado: o titular tem direito a ler o arquivo, não só a importá-lo.
          .send(JSON.stringify(data, null, 2))
      )
    },
  )

  // Pede a senha de novo: um JWT roubado (ou a aba esquecida aberta) não basta para
  // apagar a conta de alguém. Mesmo teto de força bruta do login, já que a rota
  // também responde "senha certa ou errada".
  app.delete(
    '/api/auth/me',
    {
      ...protectedRoute,
      ...(rateLimit ? { config: { rateLimit } } : {}),
      schema: privacyDocs.deleteAccount,
    },
    async (request, reply) => {
      const { password } = deleteAccountSchema.parse(request.body)
      const userId = ownerId(request)
      const credentials = users.findCredentialsById(userId)
      if (!credentials) {
        return reply.code(401).send({ error: 'unauthorized' })
      }
      // 403 e não 401: o token é válido, quem falhou foi a confirmação. Um 401 faria o
      // SPA achar que a sessão venceu e mandar o usuário para o login.
      if (!(await argon2.verify(credentials.passwordHash, password))) {
        return reply.code(403).send({ error: 'invalid_password' })
      }
      privacy.deleteUser(userId)
      return reply.code(204).send()
    },
  )
}
