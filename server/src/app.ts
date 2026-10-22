import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { DEV_APP_URL, DEV_JWT_SECRET, type LogLevel } from './config.js'
import { openDatabase } from './db/connection.js'
import { registerOpenApi } from './docs/openapi.js'
import { healthDocs } from './docs/schemas.js'
import { registerEtag } from './http/etag.js'
import {
  REQUEST_ID_HEADER,
  logQuery,
  registerRequestContext,
  resolveRequestId,
} from './http/request-context.js'
import { createLogMailer, type Mailer } from './mail/mailer.js'
import { AccountsRepository } from './modules/accounts/repository.js'
import { registerAccountRoutes } from './modules/accounts/routes.js'
import { AttachmentsRepository } from './modules/attachments/repository.js'
import { registerAttachmentRoutes } from './modules/attachments/routes.js'
import { PasswordResetRepository } from './modules/auth/password-reset.js'
import { RefreshTokensRepository } from './modules/auth/refresh-tokens.js'
import { UsersRepository } from './modules/auth/repository.js'
import { registerAuthRoutes } from './modules/auth/routes.js'
import { BudgetAlertNotifier, BudgetAlertsRepository } from './modules/budgets/alerts.js'
import { BudgetsRepository } from './modules/budgets/repository.js'
import { registerBudgetRoutes } from './modules/budgets/routes.js'
import { CategoriesRepository } from './modules/categories/repository.js'
import { registerCategoryRoutes } from './modules/categories/routes.js'
import { GoalsRepository } from './modules/goals/repository.js'
import { registerGoalRoutes } from './modules/goals/routes.js'
import { InstallmentsRepository } from './modules/installments/repository.js'
import { registerInstallmentRoutes } from './modules/installments/routes.js'
import { ProjectionRepository } from './modules/projection/repository.js'
import { PrivacyRepository } from './modules/privacy/repository.js'
import { registerPrivacyRoutes } from './modules/privacy/routes.js'
import { registerProjectionRoutes } from './modules/projection/routes.js'
import { registerReportRoutes } from './modules/reports/routes.js'
import { TransactionsRepository } from './modules/transactions/repository.js'
import { registerTransactionRoutes } from './modules/transactions/routes.js'
import { TransfersRepository } from './modules/transfers/repository.js'
import { registerTransferRoutes } from './modules/transfers/routes.js'

export interface RateLimitSettings {
  /** Teto de requisições por IP, por janela, em qualquer rota. */
  max: number
  /** Teto por IP, por janela, só nas rotas de credencial (registro, login, refresh, senha). */
  authMax: number
  /** Janela de contagem (ms ou texto tipo `'1 minute'`). */
  timeWindow: number | string
}

/**
 * Teto global folgado — uma tela do dashboard já dispara meia dúzia de chamadas —
 * e teto apertado em registro, login e refresh, que é onde força bruta bate.
 */
export const DEFAULT_RATE_LIMIT: RateLimitSettings = {
  max: 300,
  authMax: 10,
  timeWindow: '1 minute',
}

/** Validade do JWT de acesso: é a janela máxima de um token vazado ou de uma sessão já revogada. */
export const ACCESS_TOKEN_TTL = '15m'

export interface AppLoggerOptions {
  /** `debug` (ou `trace`) liga também o log de cada SQL executado, com o `reqId`. */
  level?: LogLevel
  /** Destino das linhas JSON; default: stdout (testes injetam para ler o log). */
  stream?: { write(line: string): void }
}

export interface BuildAppOptions {
  dbPath: string
  /** `true` = pino em `info` no stdout; default: sem log (testes). */
  logger?: boolean | AppLoggerOptions
  /** Mês alvo da geração de recorrentes no boot (YYYY-MM); default: mês atual. Testes injetam. */
  recurringMonth?: string
  /** Segredo HMAC dos JWTs; default só para dev/testes (o server.ts passa o do env). */
  jwtSecret?: string
  /** Limites por IP; `false` desliga o plugin (testes que disparam muita requisição). */
  rateLimit?: RateLimitSettings | false
  /** Confia no `x-forwarded-for` para `request.ip` (rate limit por cliente atrás do nginx). */
  trustProxy?: boolean
  /** Origem do SPA usada nos links de e-mail; default: Vite em desenvolvimento. */
  appUrl?: string
  /** Saída de e-mail; default: escreve no log (testes injetam um que guarda as mensagens). */
  mailer?: Mailer
  /** O mailer de log pode imprimir o corpo (com o link de recuperação)? Só fora de produção. */
  exposeMailInLogs?: boolean
}

/**
 * Erros que o próprio Fastify levanta antes do handler (corpo grande demais, tipo
 * sem parser) saem com o mesmo código curto das rotas, não com a frase em inglês.
 */
const FRAMEWORK_ERRORS: Record<string, string> = {
  FST_ERR_CTP_BODY_TOO_LARGE: 'payload_too_large',
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 'unsupported_media_type',
}

// Mês local, não UTC: a virada de mês deve seguir o relógio do usuário.
function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const logger = options.logger ?? false
  const app = Fastify({
    logger,
    trustProxy: options.trustProxy ?? false,
    // Reaproveita o id de quem veio antes (nginx, outro serviço) para a mesma
    // requisição ter um id só de ponta a ponta; sem ele, um UUID novo.
    genReqId: (request) => resolveRequestId(request.headers[REQUEST_ID_HEADER]),
  })
  // Decidido no boot: em `info` (produção) o SQLite nem chama o callback por consulta.
  const traceSql =
    typeof logger === 'object' && (logger.level === 'debug' || logger.level === 'trace')
  const db = openDatabase(options.dbPath, {
    onQuery: traceSql ? logQuery : undefined,
    onMigrated: (applied) => {
      if (applied.length > 0) {
        app.log.info({ migrations: applied }, 'migrações aplicadas')
      }
    },
  })

  // Antes de tudo, para até o 429 do rate limit sair com o `X-Request-Id`.
  registerRequestContext(app)

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

  await registerOpenApi(app)

  // O JSON Schema declarado nas rotas existe para gerar o documento OpenAPI, não
  // para validar: quem valida é o Zod dentro do handler, que devolve o 400 com erro
  // por campo. Sem estes dois compiladores neutros o Fastify usaria o AJV antes do
  // handler (rejeitando com outro formato de erro) e filtraria campos da resposta.
  app.setValidatorCompiler(() => (data) => ({ value: data }))
  app.setSerializerCompiler(() => (data) => JSON.stringify(data))

  await app.register(cors, { origin: true })
  registerEtag(app)
  await app.register(jwt, {
    secret: options.jwtSecret ?? DEV_JWT_SECRET,
    // Curto de propósito: o JWT não é consultado no banco, então "sair de todos os
    // dispositivos" só o derruba quando vence. O refresh token renova em silêncio.
    sign: { expiresIn: ACCESS_TOKEN_TTL },
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
    const fastifyError = error as { statusCode?: number; message?: string; code?: string }
    const statusCode =
      typeof fastifyError.statusCode === 'number' && fastifyError.statusCode >= 400
        ? fastifyError.statusCode
        : 500
    const known = fastifyError.code ? FRAMEWORK_ERRORS[fastifyError.code] : undefined
    if (statusCode >= 500) {
      // O detalhe fica só no log; o id na resposta é o que liga o relato à linha certa.
      return reply.code(statusCode).send({ error: 'internal_error', requestId: request.id })
    }
    return reply.code(statusCode).send({ error: known ?? fastifyError.message ?? 'erro' })
  })

  app.get('/health', { schema: healthDocs }, async () => ({ status: 'ok' }))

  const repository = new TransactionsRepository(db)
  const users = new UsersRepository(db)
  const authRateLimit =
    rateLimitSettings === false
      ? undefined
      : { max: rateLimitSettings.authMax, timeWindow: rateLimitSettings.timeWindow }
  const mailer =
    options.mailer ?? createLogMailer(app.log, { revealContent: options.exposeMailInLogs ?? true })
  const appUrl = options.appUrl ?? DEV_APP_URL
  registerAuthRoutes(
    app,
    users,
    new RefreshTokensRepository(db),
    { resets: new PasswordResetRepository(db), mailer, appUrl },
    authRateLimit,
  )
  registerPrivacyRoutes(app, new PrivacyRepository(db), users, authRateLimit)
  const accounts = new AccountsRepository(db)
  registerTransactionRoutes(
    app,
    repository,
    accounts,
    new BudgetAlertNotifier(new BudgetAlertsRepository(db), users, mailer, appUrl),
  )
  registerAttachmentRoutes(app, new AttachmentsRepository(db))
  registerBudgetRoutes(app, new BudgetsRepository(db))
  registerGoalRoutes(app, new GoalsRepository(db))
  registerCategoryRoutes(app, new CategoriesRepository(db))
  registerAccountRoutes(app, accounts)
  registerTransferRoutes(app, new TransfersRepository(db), accounts)
  registerInstallmentRoutes(app, new InstallmentsRepository(db, repository), accounts)
  registerProjectionRoutes(app, new ProjectionRepository(db))
  registerReportRoutes(app, repository)

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
