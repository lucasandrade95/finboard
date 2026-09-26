export interface AppConfig {
  port: number
  dbPath: string
  jwtSecret: string
  /** Atrás de proxy reverso (nginx do docker-compose): lê o IP do cliente do `x-forwarded-for`. */
  trustProxy: boolean
}

/** Só serve para desenvolvimento e testes: em produção o boot exige JWT_SECRET. */
export const DEV_JWT_SECRET = 'finboard-dev-secret-nao-use-em-producao'

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const jwtSecret = env.JWT_SECRET
  if (!jwtSecret && env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET é obrigatório em produção')
  }
  return {
    port: Number(env.PORT ?? 3000),
    dbPath: env.DB_PATH ?? 'data/finboard.db',
    jwtSecret: jwtSecret ?? DEV_JWT_SECRET,
    // Desligado por padrão: sem proxy na frente, o header seria forjável pelo cliente.
    trustProxy: env.TRUST_PROXY === 'true',
  }
}
