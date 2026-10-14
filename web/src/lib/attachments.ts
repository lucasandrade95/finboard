/** Mesmo teto do server: barrar aqui evita subir 10 MB só para ouvir um 413. */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024

export const ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']

/** Valor do `accept` do input: o seletor do sistema já filtra pelos tipos aceitos. */
export const ATTACHMENT_ACCEPT = ATTACHMENT_TYPES.join(',')

export type AttachmentProblem = 'type' | 'size'

/** Motivo para não enviar o arquivo, ou `null` se ele pode subir. */
export function attachmentProblem(file: Pick<File, 'type' | 'size'>): AttachmentProblem | null {
  if (!ATTACHMENT_TYPES.includes(file.type)) {
    return 'type'
  }
  if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return 'size'
  }
  return null
}

export function isPdf(blob: Pick<Blob, 'type'>): boolean {
  return blob.type === 'application/pdf'
}
