import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyReply } from 'fastify'

/**
 * ETag forte a partir dos bytes da resposta: mesmo JSON, mesma etiqueta. Não depende
 * de `updated_at` nem de versão no banco — qualquer leitura serve, inclusive as
 * agregadas (resumo, gráficos), que não têm um registro único para versionar.
 */
export function computeEtag(body: string | Buffer): string {
  return `"${createHash('sha1').update(body).digest('base64url')}"`
}

/**
 * `If-None-Match` aceita lista separada por vírgula e `*`. A comparação é a fraca da
 * RFC 9110 (ignora o `W/`), que é a exigida para GET condicional — um proxy que
 * recomprime a resposta pode ter enfraquecido a etiqueta no caminho.
 */
export function matchesIfNoneMatch(header: string, etag: string): boolean {
  const opaque = (tag: string) => tag.trim().replace(/^W\//, '')
  return header.split(',').some((tag) => tag.trim() === '*' || opaque(tag) === opaque(etag))
}

function appendVary(reply: FastifyReply, field: string): void {
  const current = reply.getHeader('vary')
  const fields = typeof current === 'string' ? current.split(',').map((f) => f.trim()) : []
  if (!fields.some((f) => f === '*' || f.toLowerCase() === field.toLowerCase())) {
    reply.header('vary', [...fields.filter(Boolean), field].join(', '))
  }
}

/**
 * GET condicional em toda leitura JSON bem-sucedida: a resposta sai com `ETag` e,
 * quando o cliente reapresenta a mesma etiqueta, vira 304 sem corpo. O navegador faz
 * a revalidação sozinho (o `fetch` do SPA recebe o 200 do cache), então o ganho é
 * banda e parse, não uma consulta a menos: o handler roda igual para gerar o hash.
 *
 * `private, no-cache` porque os dados são da conta do token: o navegador pode guardar,
 * proxy compartilhado não, e toda reutilização passa pela revalidação — nunca mostra
 * um saldo velho. Rotas que já decidiram `no-store` (comprovante, PDF, export) ficam
 * de fora, assim como streams e respostas que não são JSON.
 */
export function registerEtag(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return payload
    if (reply.statusCode !== 200) return payload
    if (typeof payload !== 'string' && !Buffer.isBuffer(payload)) return payload
    const contentType = reply.getHeader('content-type')
    if (typeof contentType !== 'string' || !contentType.startsWith('application/json')) {
      return payload
    }
    const cacheControl = reply.getHeader('cache-control')
    if (typeof cacheControl === 'string' && cacheControl.includes('no-store')) return payload

    const etag = computeEtag(payload)
    reply.header('etag', etag)
    reply.header('cache-control', 'private, no-cache')
    appendVary(reply, 'Authorization')

    const ifNoneMatch = request.headers['if-none-match']
    if (typeof ifNoneMatch === 'string' && matchesIfNoneMatch(ifNoneMatch, etag)) {
      reply.code(304)
      reply.removeHeader('content-type')
      return null
    }
    return payload
  })
}
