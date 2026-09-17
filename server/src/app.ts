import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { DEV_JWT_SECRET } from './config.js'
import { openDatabase } from './db/connection.js'
import { UsersRepository } from './modules/auth/repository.js'
import { registerAuthRoutes } from './modules/auth/routes.js'
import { BudgetsRepository } from './modules/budgets/repository.js'
import { registerBudgetRoutes } from './modules/budgets/routes.js'
import { GoalsRepository } from './modules/goals/repository.js'
import { registerGoalRoutes } from './modules/goals/routes.js'
import { TransactionsRepository } from './modules/transactions/repository.js'
import { registerTransactionRoutes } from './modules/transactions/routes.js'

export interface RateLimitSettings {
  /** Teto de requisições por IP, por janela, em qualquer rota. */
  max: number
  /** Teto por IP, por janela, só em registro e login. */
  authMax: number
  /** Janela de contagem (ms ou texto tipo `'1 minute'`). */
  timeWindow: number | string
}

/**
 * Teto global folgado — uma tela do dashboard já dispara meia dúzia de chamadas —
 * e teto apertado no par registro/login, que é onde força bruta bate.
 */
export const DEFAULT_RATE_LIMIT: RateLimitSettings = {
  max: 300,
  authMax: 10,
  timeWindow: '1 minute',
}

export interface BuildAppOptions {
  dbPath: string
  logger?: boolean
  /** Mês alvo da geração de recorrentes no boot (YYYY-MM); default: mês atual. Testes injetam. */
  recurringMonth?: string
  /** Segredo HMAC dos JWTs; default só para dev/testes (o server.ts passa o do env). */
  jwtSecret?: string
  /** Limites por IP; `false` desliga o plugin (testes que disparam muita requisição). */
  rateLimit?: RateLimitSettings | false
}

// Mês local, não UTC: a virada de mês deve seguir o relógio do usuário.
function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false })
  const db = openDatabase(options.dbPath, {
    onMigrated: (applied) => {
      if (applied.length > 0) {
        app.log.info({ migrations: applied }, 'migrações aplicadas')
      }
    },
  })

  // Helmet primeiro: os cabeçalhos de segurança valem para toda resposta, inclusive erro.
  await app.register(helmet, {
    // O SPA roda em outra origem, então o padrão `same-origin` do CORP barraria o
    // próprio front ao consumir a API direto (sem o proxy do Vite).
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })

  const rateLimitSettings = options.rateLimit ?? DEFAULT_RATE_LIMIT
  if (rateLimitSettings !== false) {
    await app.register(rateLimit, {
      max: rateLimitSettings.max,
      timeWindow: rateLimitSettings.timeWindow,
      // O 429 sai no mesmo formato dos outros erros da API: `{ error: '...' }`.
      errorResponseBuilder: () =>
        Object.assign(new Error('rate_limit_exceeded'), { statusCode: 429 }),
    })
  }

  await app.register(cors, { origin: true })
  await app.register(jwt, {
    secret: options.jwtSecret ?? DEV_JWT_SECRET,
    sign: { expiresIn: '7d' },
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'validation_error',
        issues: error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      })
    }
    request.log.error(error)
    const fastifyError = error as { statusCode?: number; message?: string }
    const statusCode =
      typeof fastifyError.statusCode === 'number' && fastifyError.statusCode >= 400
        ? fastifyError.statusCode
        : 500
    return reply
      .code(statusCode)
      .send({ error: statusCode >= 500 ? 'internal_error' : (fastifyError.message ?? 'erro') })
  })

  app.get('/health', async () => ({ status: 'ok' }))

  const repository = new TransactionsRepository(db)
  registerAuthRoutes(
    app,
    new UsersRepository(db),
    rateLimitSettings === false
      ? undefined
      : { max: rateLimitSettings.authMax, timeWindow: rateLimitSettings.timeWindow },
  )
  registerTransactionRoutes(app, repository)
  registerBudgetRoutes(app, new BudgetsRepository(db))
  registerGoalRoutes(app, new GoalsRepository(db))

  // Uma passada por dono: cada conta tem as próprias séries recorrentes.
  const month = options.recurringMonth ?? currentMonth()
  const generated = repository
    .listOwnersWithRecurring()
    .reduce(
      (count, userId) => count + repository.generateRecurringForMonth(userId, month).length,
      0,
    )
  if (generated > 0) {
    app.log.info({ count: generated }, 'transações recorrentes geradas para o mês')
  }

  app.addHook('onClose', () => {
    db.close()
  })

  return app
}
