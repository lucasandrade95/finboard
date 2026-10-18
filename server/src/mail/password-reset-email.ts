import type { MailMessage } from './mailer.js'

export interface PasswordResetEmailInput {
  to: string
  /** Link completo, com o token no fragmento (`#reset=`). */
  link: string
  expiresInMinutes: number
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** O e-mail do usuário entra no HTML: sem escape, um endereço forjado vira marcação. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)
}

/**
 * Template pt-BR da recuperação de senha, em texto e HTML com o mesmo conteúdo.
 * HTML simples com estilo inline: cliente de e-mail ignora `<style>` e CSS externo.
 */
export function buildPasswordResetEmail({
  to,
  link,
  expiresInMinutes,
}: PasswordResetEmailInput): MailMessage {
  const subject = 'Finboard: redefinição de senha'
  const text = [
    'Olá!',
    '',
    `Recebemos um pedido para redefinir a senha da conta ${to} no Finboard.`,
    'Para escolher uma senha nova, abra o link abaixo:',
    '',
    link,
    '',
    `O link vale por ${expiresInMinutes} minutos e só pode ser usado uma vez.`,
    'Ao trocar a senha, as sessões abertas em outros dispositivos são encerradas.',
    '',
    'Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.',
  ].join('\n')

  const safeTo = escapeHtml(to)
  const safeLink = escapeHtml(link)
  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5">
    <p>Olá!</p>
    <p>Recebemos um pedido para redefinir a senha da conta <strong>${safeTo}</strong> no Finboard.</p>
    <p>
      <a href="${safeLink}" style="display: inline-block; padding: 10px 16px; background: #2563eb; color: #ffffff; border-radius: 6px; text-decoration: none">Redefinir minha senha</a>
    </p>
    <p>Se o botão não funcionar, copie e cole este endereço no navegador:<br>${safeLink}</p>
    <p>O link vale por ${expiresInMinutes} minutos e só pode ser usado uma vez. Ao trocar a senha, as sessões abertas em outros dispositivos são encerradas.</p>
    <p style="color: #6b7280">Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.</p>
  </body>
</html>`

  return { to, subject, text, html }
}
