import argon2 from 'argon2'
import type { FastifyInstance } from 'fastify'
import { authenticate } from './authenticate.js'
import type { UserRecord, UsersRepository } from './repository.js'
import { loginSchema, registerSchema } from './schemas.js'

export function registerAuthRoutes(app: FastifyInstance, repository: UsersRepository): void {
  const issueToken = (user: UserRecord) => app.jwt.sign({ sub: String(user.id), email: user.email })

  // Hash de uma senha qualquer, calculado uma vez: login com e-mail inexistente
  // também paga um argon2.verify, então o tempo de resposta não denuncia quais
  // e-mails têm conta.
  let dummyHash: Promise<string> | undefined
  const getDummyHash = () => (dummyHash ??= argon2.hash('finboard-dummy-password'))

  app.post('/api/auth/register', async (request, reply) => {
    const { email, password } = registerSchema.parse(request.body)
    // argon2id com os parâmetros padrão da lib (64 MiB, t=3): o salt vai embutido no hash.
    const passwordHash = await argon2.hash(password)
    const user = repository.create(email, passwordHash)
    if (!user) {
      return reply.code(409).send({ error: 'email_taken' })
    }
    return reply.code(201).send({ user, token: issueToken(user) })
  })

  app.post('/api/auth/login', async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body)
    const credentials = repository.findCredentialsByEmail(email)
    if (!credentials) {
      await argon2.verify(await getDummyHash(), password)
      return reply.code(401).send({ error: 'invalid_credentials' })
    }
    if (!(await argon2.verify(credentials.passwordHash, password))) {
      return reply.code(401).send({ error: 'invalid_credentials' })
    }
    return { user: credentials.user, token: issueToken(credentials.user) }
  })

  app.get('/api/auth/me', { preHandler: authenticate }, async (request, reply) => {
    // Token válido de uma conta que não existe mais não autentica ninguém.
    const user = repository.findById(Number(request.user.sub))
    if (!user) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
    return { user }
  })
}
