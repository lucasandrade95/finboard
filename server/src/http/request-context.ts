import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export const REQUEST_ID_HEADER = 'x-request-id'

/**
 * Id vindo de fora (nginx, outro serviço, o próprio cliente) só é reaproveitado se
 * for curto e sem caractere estranho: ele vai parar no log e no header de resposta,
 * então não pode carregar quebra de linha nem virar um campo de 10 KB.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,64}$/

export function resolveRequestId(header: string | string[] | undefined): string {
  return typeof header === 'string' && SAFE_REQUEST_ID.test(header) ? header : randomUUID()
}

interface RequestContext {
  log: FastifyBaseLogger
}

const storage = new AsyncLocalStorage<RequestContext>()

/**
 * Logger da requisição em curso (já com o `reqId`), ou `undefined` fora de uma
 * requisição — boot, migrações. É assim que o id chega no repositório sem passar
 * `request` de mão em mão por toda assinatura.
 */
export function currentLog(): FastifyBaseLogger | undefined {
  return storage.getStore()?.log
}

/**
 * Remove os valores que o SQLite expande na consulta (`'texto'`, `x'blob'`, números),
 * deixando só a forma: hash de senha, token e e-mail não podem ir para o log, e a
 * mesma consulta com parâmetros diferentes vira uma linha só na hora de agrupar.
 */
export function sqlFingerprint(sql: string): string {
  return (
    sql
      .replace(/\bx'[0-9a-f]*'/gi, '?')
      .replace(/'(?:[^']|'')*'/g, '?')
      // Texto longo o SQLite já corta e anota (`'abc…'/*+40 bytes*/`): a nota sai também.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(?<![\w.])-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, '?')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** Loga, em `debug`, cada SQL executado dentro de uma requisição, com o `reqId` dela. */
export function logQuery(sql: string): void {
  currentLog()?.debug({ sql: sqlFingerprint(sql) }, 'sql')
}

/**
 * Primeiro hook da cadeia: devolve o id no `X-Request-Id` (o cliente cita o id ao
 * reportar erro e acha a linha no log) e abre o contexto assíncrono com o logger da
 * requisição, que vale até o fim do handler — inclusive no que ele dispara sem
 * aguardar, como o e-mail de alerta de orçamento.
 */
export function registerRequestContext(app: FastifyInstance): void {
  app.addHook('onRequest', (request, reply, done) => {
    reply.header(REQUEST_ID_HEADER, request.id)
    storage.run({ log: request.log }, done)
  })
}
