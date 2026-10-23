export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

export interface AppConfig {
  port: number
  dbPath: string
  jwtSecret: string
  /** Atrás de proxy reverso (nginx do docker-compose): lê o IP do cliente do `x-forwarded-for`. */
  trustProxy: boolean
  /** Origem do SPA, base dos links enviados por e-mail. */
  appUrl: string
  /** Fora de produção o e-mail vai para o log por inteiro, para o dev clicar no link. */
  exposeMailInLogs: boolean
  /** Nível do pino; `debug` inclui cada SQL executado (sem os valores) com o `reqId`. */
  logLevel: LogLevel
  /** Bearer de `/metrics`; vazio = rota aberta (o nginx do compose só repassa `/api`). */
  metricsToken?: string
}

/** Só serve para desenvolvimento e testes: em produção o boot exige JWT_SECRET. */
export const DEV_JWT_SECRET = 'finboard-dev-secret-nao-use-em-producao'

/** Origem do Vite em desenvolvimento. */
export const DEV_APP_URL = 'http://localhost:5173'

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const jwtSecret = env.JWT_SECRET
  if (!jwtSecret && env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET é obrigatório em produção')
  }
  const logLevel = env.LOG_LEVEL ?? 'info'
  if (!isLogLevel(logLevel)) {
    throw new Error(`LOG_LEVEL inválido: use ${LOG_LEVELS.join(', ')}`)
  }
  return {
    port: Number(env.PORT ?? 3000),
    dbPath: env.DB_PATH ?? 'data/finboard.db',
    jwtSecret: jwtSecret ?? DEV_JWT_SECRET,
    // Desligado por padrão: sem proxy na frente, o header seria forjável pelo cliente.
    trustProxy: env.TRUST_PROXY === 'true',
    appUrl: env.APP_URL ?? DEV_APP_URL,
    exposeMailInLogs: env.NODE_ENV !== 'production',
    logLevel,
    ...(env.METRICS_TOKEN ? { metricsToken: env.METRICS_TOKEN } : {}),
  }
}

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value)
}
