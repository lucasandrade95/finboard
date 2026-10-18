import type { FastifyBaseLogger } from 'fastify'

export interface MailMessage {
  to: string
  subject: string
  /** Versão em texto puro: cliente de e-mail sem HTML e filtro de spam leem esta. */
  text: string
  html: string
}

/**
 * Porta de saída de e-mail. As rotas só conhecem esta interface: trocar o envio
 * de verdade (SMTP, SES, Resend…) é escrever outro adaptador, sem mexer em rota.
 */
export interface Mailer {
  send(message: MailMessage): Promise<void>
}

/**
 * Adaptador de desenvolvimento: em vez de enviar, escreve o e-mail no log. Com
 * `revealContent` desligado (produção) só registra destinatário e assunto — o
 * corpo traz o link de recuperação, que é uma credencial e não pode ir para log.
 */
export function createLogMailer(
  log: FastifyBaseLogger,
  options: { revealContent: boolean },
): Mailer {
  return {
    send(message) {
      if (options.revealContent) {
        log.info({ mail: { to: message.to, subject: message.subject } }, message.text)
      } else {
        log.warn(
          { mail: { to: message.to, subject: message.subject } },
          'e-mail não enviado: nenhum provedor configurado',
        )
      }
      return Promise.resolve()
    },
  }
}
