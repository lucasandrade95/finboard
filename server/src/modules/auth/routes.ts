import argon2 from 'argon2'
import type { FastifyInstance, RouteShorthandOptions } from 'fastify'
import { authDocs } from '../../docs/schemas.js'
import type { Mailer } from '../../mail/mailer.js'
import { buildPasswordResetEmail } from '../../mail/password-reset-email.js'
import { authenticate, ownerId } from './authenticate.js'
import { PASSWORD_RESET_TTL_MS, type PasswordResetRepository } from './password-reset.js'
import type { RefreshTokensRepository } from './refresh-tokens.js'
import type { UserRecord, UsersRepository } from './repository.js'
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from './schemas.js'

export interface AuthRateLimit {
  max: number
  timeWindow: number | string
}

export interface PasswordRecovery {
  resets: PasswordResetRepository
  mailer: Mailer
  /** Origem do SPA, base do link enviado por e-mail (ex.: `https://finboard.app`). */
  appUrl: string
}

export function registerAuthRoutes(
  app: FastifyInstance,
  repository: UsersRepository,
  refreshTokens: RefreshTokensRepository,
  recovery: PasswordRecovery,
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

  // Mesma resposta exista a conta ou não: a rota não pode virar um "este e-mail está
  // cadastrado?". O envio não é aguardado — a latência do provedor de e-mail também
  // denunciaria quais endereços têm conta — e a falha dele só vai para o log.
  app.post(
    '/api/auth/forgot-password',
    { ...credentialsRoute, schema: authDocs.forgotPassword },
    async (request, reply) => {
      const { email } = forgotPasswordSchema.parse(request.body)
      const credentials = repository.findCredentialsByEmail(email)
      if (credentials) {
        const { token } = recovery.resets.issue(credentials.user.id)
        // Fragmento (`#`), não query string: o navegador não manda o token para servidor
        // nenhum, então ele não aparece em log de proxy nem no header Referer.
        const link = `${recovery.appUrl.replace(/\/+$/, '')}/#reset=${token}`
        const message = buildPasswordResetEmail({
          to: credentials.user.email,
          link,
          expiresInMinutes: PASSWORD_RESET_TTL_MS / 60_000,
        })
        recovery.mailer.send(message).catch((error: unknown) => {
          request.log.error(error, 'falha ao enviar e-mail de recuperação de senha')
        })
      }
      return reply.code(202).send()
    },
  )

  // Senha nova derruba todas as sessões: se alguém pediu a recuperação porque a senha
  // vazou, quem estava usando a conta com ela sai junto.
  app.post(
    '/api/auth/reset-password',
    { ...credentialsRoute, schema: authDocs.resetPassword },
    async (request, reply) => {
      const { token, password } = resetPasswordSchema.parse(request.body)
      // Hash antes de consultar o token: com token inválido a resposta custa o mesmo.
      const passwordHash = await argon2.hash(password)
      const userId = recovery.resets.resetPassword(token, passwordHash)
      if (userId === undefined) {
        return reply.code(400).send({ error: 'invalid_reset_token' })
      }
      refreshTokens.revokeAllForUser(userId)
      return reply.code(204).send()
    },
  )
}
