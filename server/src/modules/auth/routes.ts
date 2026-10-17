import argon2 from 'argon2'
import type { FastifyInstance, RouteShorthandOptions } from 'fastify'
import { authDocs } from '../../docs/schemas.js'
import { authenticate, ownerId } from './authenticate.js'
import type { RefreshTokensRepository } from './refresh-tokens.js'
import type { UserRecord, UsersRepository } from './repository.js'
import { loginSchema, refreshSchema, registerSchema } from './schemas.js'

export interface AuthRateLimit {
  max: number
  timeWindow: number | string
}

export function registerAuthRoutes(
  app: FastifyInstance,
  repository: UsersRepository,
  refreshTokens: RefreshTokensRepository,
  rateLimit?: AuthRateLimit,
): void {
  // Registro e login são as rotas que um ataque de força bruta martela: cada uma
  // ganha um teto próprio, bem abaixo do global. Sem o plugin, `config` é inerte.
  const credentialsRoute: RouteShorthandOptions = rateLimit ? { config: { rateLimit } } : {}

  const issueToken = (user: UserRecord) => app.jwt.sign({ sub: String(user.id), email: user.email })

  // Sessão = JWT curto (15 min, stateless, vai em toda requisição) + refresh token
  // opaco e de uso único (30 dias, guardado no banco, só serve para pedir outro par).
  // Cada login abre uma família nova de refresh tokens: um dispositivo a mais.
  const openSession = (user: UserRecord) => ({
    user,
    token: issueToken(user),
    refreshToken: refreshTokens.issue(user.id).token,
  })

  // Hash de uma senha qualquer, calculado uma vez: login com e-mail inexistente
  // também paga um argon2.verify, então o tempo de resposta não denuncia quais
  // e-mails têm conta.
  let dummyHash: Promise<string> | undefined
  const getDummyHash = () => (dummyHash ??= argon2.hash('finboard-dummy-password'))

  app.post(
    '/api/auth/register',
    { ...credentialsRoute, schema: authDocs.register },
    async (request, reply) => {
      const { email, password } = registerSchema.parse(request.body)
      // argon2id com os parâmetros padrão da lib (64 MiB, t=3): o salt vai embutido no hash.
      const passwordHash = await argon2.hash(password)
      const user = repository.create(email, passwordHash)
      if (!user) {
        return reply.code(409).send({ error: 'email_taken' })
      }
      return reply.code(201).send(openSession(user))
    },
  )

  app.post(
    '/api/auth/login',
    { ...credentialsRoute, schema: authDocs.login },
    async (request, reply) => {
      const { email, password } = loginSchema.parse(request.body)
      const credentials = repository.findCredentialsByEmail(email)
      if (!credentials) {
        await argon2.verify(await getDummyHash(), password)
        return reply.code(401).send({ error: 'invalid_credentials' })
      }
      if (!(await argon2.verify(credentials.passwordHash, password))) {
        return reply.code(401).send({ error: 'invalid_credentials' })
      }
      return openSession(credentials.user)
    },
  )

  app.get(
    '/api/auth/me',
    { preHandler: authenticate, schema: authDocs.me },
    async (request, reply) => {
      // Token válido de uma conta que não existe mais não autentica ninguém.
      const user = repository.findById(Number(request.user.sub))
      if (!user) {
        return reply.code(401).send({ error: 'unauthorized' })
      }
      return { user }
    },
  )

  // Mesmo teto de força bruta do login: chutar refresh token também é tentativa de entrar.
  app.post(
    '/api/auth/refresh',
    { ...credentialsRoute, schema: authDocs.refresh },
    async (request, reply) => {
      const { refreshToken } = refreshSchema.parse(request.body)
      const rotation = refreshTokens.rotate(refreshToken)
      // Reuso e token inválido saem iguais: o cliente faz a mesma coisa (volta ao login).
      if (rotation.status !== 'rotated') {
        return reply.code(401).send({ error: 'invalid_refresh_token' })
      }
      const user = repository.findById(rotation.userId)
      if (!user) {
        return reply.code(401).send({ error: 'invalid_refresh_token' })
      }
      return {
        user,
        token: issueToken(user),
        refreshToken: rotation.refreshToken.token,
      }
    },
  )

  // Sem exigir JWT: o access token pode já ter vencido quando o usuário clica em "Sair".
  // Quem tem o refresh token tem a sessão, então é ele que prova o direito de encerrá-la.
  app.post('/api/auth/logout', { schema: authDocs.logout }, async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body)
    refreshTokens.revoke(refreshToken)
    return reply.code(204).send()
  })

  app.post(
    '/api/auth/logout-all',
    { preHandler: authenticate, schema: authDocs.logoutAll },
    async (request) => ({ revokedSessions: refreshTokens.revokeAllForUser(ownerId(request)) }),
  )
}
