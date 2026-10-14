import type { FastifyInstance, FastifyRequest } from 'fastify'
import { attachmentDocs } from '../../docs/schemas.js'
import { ownerId, protectedRoute } from '../auth/authenticate.js'
import { idParamSchema } from '../transactions/schemas.js'
import type { AttachmentsRepository } from './repository.js'
import {
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_MIME_TYPES,
  attachmentMimeTypeSchema,
  MAX_ATTACHMENT_BYTES,
  matchesSignature,
} from './schemas.js'

const ATTACHMENT_URL = '/api/transactions/:id/attachment'

/** `image/png; charset=...` vira `image/png`: só o tipo entra na lista permitida. */
function mediaTypeOf(request: FastifyRequest): string {
  return (request.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase()
}

export function registerAttachmentRoutes(
  app: FastifyInstance,
  attachments: AttachmentsRepository,
): void {
  // Corpo binário cru (o front manda o próprio File): sem multipart e sem arquivo
  // temporário. O teto vem do `bodyLimit` da rota, que responde 413 antes de ler tudo.
  app.addContentTypeParser(
    [...ATTACHMENT_MIME_TYPES],
    { parseAs: 'buffer' },
    (_request, body, done) => {
      done(null, body)
    },
  )

  app.put(
    ATTACHMENT_URL,
    { ...protectedRoute, bodyLimit: MAX_ATTACHMENT_BYTES, schema: attachmentDocs.upload },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params)
      const mimeType = attachmentMimeTypeSchema.safeParse(mediaTypeOf(request))
      if (!mimeType.success) {
        return reply.code(415).send({ error: 'unsupported_media_type' })
      }
      const content = request.body
      if (
        !Buffer.isBuffer(content) ||
        content.length === 0 ||
        !matchesSignature(mimeType.data, content)
      ) {
        return reply.code(400).send({ error: 'invalid_file' })
      }
      const saved = attachments.save(ownerId(request), id, mimeType.data, content)
      if (!saved) {
        return reply.code(404).send({ error: 'not_found' })
      }
      return saved
    },
  )

  app.get(
    ATTACHMENT_URL,
    { ...protectedRoute, schema: attachmentDocs.download },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params)
      const attachment = attachments.find(ownerId(request), id)
      if (!attachment) {
        return reply.code(404).send({ error: 'not_found' })
      }
      const filename = `comprovante-${id}.${ATTACHMENT_EXTENSIONS[attachment.mimeType]}`
      return (
        reply
          .header('content-type', attachment.mimeType)
          .header('content-disposition', `inline; filename="${filename}"`)
          // Documento financeiro de uma pessoa: nada de cache compartilhado no caminho.
          .header('cache-control', 'private, no-store')
          .send(attachment.content)
      )
    },
  )

  app.delete(
    ATTACHMENT_URL,
    { ...protectedRoute, schema: attachmentDocs.remove },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params)
      if (!attachments.delete(ownerId(request), id)) {
        return reply.code(404).send({ error: 'not_found' })
      }
      return reply.code(204).send()
    },
  )
}
