import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { MAX_ATTACHMENT_BYTES, matchesSignature } from '../src/modules/attachments/schemas.js'

const OWNER = { email: 'lucas@example.com', password: 'senha-forte-123' }
const OTHER = { email: 'maria@example.com', password: 'outra-senha-456' }

// Só a assinatura importa para a API: o resto do arquivo pode ser qualquer coisa.
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('resto do png')])
const JPEG = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.from('resto do jpeg')])
const WEBP = Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'latin1')
const PDF = Buffer.from('%PDF-1.7\nnota fiscal')

let app: FastifyInstance
let ownerAuth: string

async function registerAndAuthorize(credentials: typeof OWNER): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: credentials,
  })
  return `Bearer ${response.json().token}`
}

async function inject(options: InjectOptions, auth = ownerAuth) {
  return app.inject({ ...options, headers: { authorization: auth, ...options.headers } })
}

async function createTransaction(auth = ownerAuth): Promise<number> {
  const response = await inject(
    {
      method: 'POST',
      url: '/api/transactions',
      payload: {
        type: 'expense',
        description: 'Farmácia',
        amountCents: 4590,
        category: 'saúde',
        occurredOn: '2026-10-14',
      },
    },
    auth,
  )
  return response.json().id as number
}

function upload(id: number, content: Buffer, contentType = 'image/png', auth = ownerAuth) {
  return inject(
    {
      method: 'PUT',
      url: `/api/transactions/${id}/attachment`,
      headers: { 'content-type': contentType },
      payload: content,
    },
    auth,
  )
}

async function listedTransaction(id: number) {
  const response = await inject({ method: 'GET', url: '/api/transactions' })
  return (response.json().items as Array<{ id: number; hasAttachment: boolean }>).find(
    (item) => item.id === id,
  )
}

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:', rateLimit: false })
  await app.ready()
  ownerAuth = await registerAndAuthorize(OWNER)
})

afterEach(async () => {
  await app.close()
})

describe('assinatura do arquivo', () => {
  it('reconhece PNG, JPEG, WebP e PDF pelos primeiros bytes', () => {
    expect(matchesSignature('image/png', PNG)).toBe(true)
    expect(matchesSignature('image/jpeg', JPEG)).toBe(true)
    expect(matchesSignature('image/webp', WEBP)).toBe(true)
    expect(matchesSignature('application/pdf', PDF)).toBe(true)
  })

  it('recusa conteúdo que não bate com o tipo declarado', () => {
    expect(matchesSignature('image/png', PDF)).toBe(false)
    expect(matchesSignature('application/pdf', Buffer.from('<html>'))).toBe(false)
    expect(matchesSignature('image/webp', Buffer.from('RIFF\x00\x00\x00\x00WAVE', 'latin1'))).toBe(
      false,
    )
    expect(matchesSignature('image/jpeg', Buffer.alloc(0))).toBe(false)
  })
})

describe('PUT /api/transactions/:id/attachment', () => {
  it('salva o comprovante e devolve tipo e tamanho', async () => {
    const id = await createTransaction()

    const response = await upload(id, PNG)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      transactionId: id,
      mimeType: 'image/png',
      sizeBytes: PNG.length,
    })
    expect(response.json().uploadedAt).toEqual(expect.any(String))
  })

  it('marca a transação na listagem como tendo comprovante', async () => {
    const id = await createTransaction()
    const other = await createTransaction()

    await upload(id, PDF, 'application/pdf')

    expect((await listedTransaction(id))?.hasAttachment).toBe(true)
    expect((await listedTransaction(other))?.hasAttachment).toBe(false)
  })

  it('troca o comprovante anterior em vez de acumular', async () => {
    const id = await createTransaction()
    await upload(id, PNG)

    const replaced = await upload(id, JPEG, 'image/jpeg')
    expect(replaced.statusCode).toBe(200)

    const download = await inject({ method: 'GET', url: `/api/transactions/${id}/attachment` })
    expect(download.headers['content-type']).toBe('image/jpeg')
    expect(download.rawPayload.equals(JPEG)).toBe(true)
  })

  it('aceita Content-Type com parâmetros', async () => {
    const id = await createTransaction()
    const response = await upload(id, PDF, 'application/pdf; name=nota.pdf')
    expect(response.statusCode).toBe(200)
  })

  it('recusa tipo fora da lista com 415', async () => {
    const id = await createTransaction()

    const gif = await upload(id, Buffer.from('GIF89a'), 'image/gif')
    expect(gif.statusCode).toBe(415)
    expect(gif.json()).toEqual({ error: 'unsupported_media_type' })

    // JSON tem parser, mas não é comprovante: a rota recusa do mesmo jeito.
    const json = await inject({
      method: 'PUT',
      url: `/api/transactions/${id}/attachment`,
      payload: { file: 'x' },
    })
    expect(json.statusCode).toBe(415)
  })

  it('recusa arquivo cujo conteúdo não bate com o tipo declarado', async () => {
    const id = await createTransaction()

    const response = await upload(id, Buffer.from('<script>alert(1)</script>'), 'image/png')

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'invalid_file' })
    expect((await listedTransaction(id))?.hasAttachment).toBe(false)
  })

  it('recusa arquivo acima de 2 MB com 413', async () => {
    const id = await createTransaction()
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_ATTACHMENT_BYTES)])

    const response = await upload(id, big)

    expect(response.statusCode).toBe(413)
    expect(response.json()).toEqual({ error: 'payload_too_large' })
  })

  it('aceita arquivo exatamente no limite', async () => {
    const id = await createTransaction()
    const exact = Buffer.concat([PNG, Buffer.alloc(MAX_ATTACHMENT_BYTES - PNG.length)])

    const response = await upload(id, exact)

    expect(response.statusCode).toBe(200)
    expect(response.json().sizeBytes).toBe(MAX_ATTACHMENT_BYTES)
  })

  it('responde 404 para transação inexistente e 401 sem token', async () => {
    expect((await upload(999, PNG)).statusCode).toBe(404)

    const anonymous = await app.inject({
      method: 'PUT',
      url: '/api/transactions/1/attachment',
      headers: { 'content-type': 'image/png' },
      payload: PNG,
    })
    expect(anonymous.statusCode).toBe(401)
  })
})

describe('GET /api/transactions/:id/attachment', () => {
  it('devolve o arquivo com tipo, nome e sem cache compartilhado', async () => {
    const id = await createTransaction()
    await upload(id, PDF, 'application/pdf')

    const response = await inject({ method: 'GET', url: `/api/transactions/${id}/attachment` })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('application/pdf')
    expect(response.headers['content-disposition']).toBe(`inline; filename="comprovante-${id}.pdf"`)
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.rawPayload.equals(PDF)).toBe(true)
  })

  it('responde 404 quando a transação não tem comprovante', async () => {
    const id = await createTransaction()
    const response = await inject({ method: 'GET', url: `/api/transactions/${id}/attachment` })
    expect(response.statusCode).toBe(404)
  })
})

describe('DELETE /api/transactions/:id/attachment', () => {
  it('remove o comprovante e a marca na listagem', async () => {
    const id = await createTransaction()
    await upload(id, PNG)

    const removed = await inject({ method: 'DELETE', url: `/api/transactions/${id}/attachment` })
    expect(removed.statusCode).toBe(204)
    expect((await listedTransaction(id))?.hasAttachment).toBe(false)

    const again = await inject({ method: 'DELETE', url: `/api/transactions/${id}/attachment` })
    expect(again.statusCode).toBe(404)
  })

  it('some junto quando a transação é excluída', async () => {
    const id = await createTransaction()
    await upload(id, PNG)

    await inject({ method: 'DELETE', url: `/api/transactions/${id}` })

    const response = await inject({ method: 'GET', url: `/api/transactions/${id}/attachment` })
    expect(response.statusCode).toBe(404)
  })
})

describe('escopo por usuário', () => {
  it('não deixa outra conta ler, trocar nem apagar o comprovante', async () => {
    const id = await createTransaction()
    await upload(id, PNG)
    const otherAuth = await registerAndAuthorize(OTHER)

    const read = await inject(
      { method: 'GET', url: `/api/transactions/${id}/attachment` },
      otherAuth,
    )
    const replace = await upload(id, PDF, 'application/pdf', otherAuth)
    const remove = await inject(
      { method: 'DELETE', url: `/api/transactions/${id}/attachment` },
      otherAuth,
    )

    expect([read.statusCode, replace.statusCode, remove.statusCode]).toEqual([404, 404, 404])
    const own = await inject({ method: 'GET', url: `/api/transactions/${id}/attachment` })
    expect(own.headers['content-type']).toBe('image/png')
  })
})
