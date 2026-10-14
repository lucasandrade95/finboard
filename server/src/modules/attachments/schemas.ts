import { z } from 'zod'

/** Teto do comprovante: foto de celular comprimida ou PDF de nota fiscal cabem com folga. */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024

export const ATTACHMENT_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const

export const attachmentMimeTypeSchema = z.enum(ATTACHMENT_MIME_TYPES)

export type AttachmentMimeType = z.infer<typeof attachmentMimeTypeSchema>

export const ATTACHMENT_EXTENSIONS: Record<AttachmentMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

function startsWith(content: Buffer, signature: string, offset = 0): boolean {
  const bytes = Buffer.from(signature, 'latin1')
  return content.subarray(offset, offset + bytes.length).equals(bytes)
}

/**
 * O Content-Type é só o que o cliente declarou: os primeiros bytes confirmam que
 * o arquivo é mesmo PNG/JPEG/WebP/PDF. Sem isso, um HTML com `image/png` seria
 * guardado e servido de volta como se fosse imagem.
 */
export function matchesSignature(mimeType: AttachmentMimeType, content: Buffer): boolean {
  switch (mimeType) {
    case 'image/png':
      return startsWith(content, '\x89PNG\r\n\x1a\n')
    case 'image/jpeg':
      return startsWith(content, '\xff\xd8\xff')
    case 'image/webp':
      return startsWith(content, 'RIFF') && startsWith(content, 'WEBP', 8)
    case 'application/pdf':
      return startsWith(content, '%PDF-')
  }
}
