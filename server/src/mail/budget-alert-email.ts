import { formatBrl, monthLabel } from '../modules/reports/monthly-report.js'
import type { MailMessage } from './mailer.js'
import { escapeHtml } from './password-reset-email.js'

export interface BudgetAlertEmailInput {
  to: string
  /** Origem do SPA: o botão leva ao dashboard, onde fica a barra do orçamento. */
  appUrl: string
  category: string
  month: string
  threshold: 80 | 100
  budgetCents: number
  spentCents: number
}

/**
 * Template pt-BR do aviso de orçamento, em texto e HTML com o mesmo conteúdo.
 * O nome da categoria é digitado pelo usuário: entra no HTML sempre escapado.
 */
export function buildBudgetAlertEmail({
  to,
  appUrl,
  category,
  month,
  threshold,
  budgetCents,
  spentCents,
}: BudgetAlertEmailInput): MailMessage {
  const exceeded = threshold === 100
  // Porcentagem só para leitura, arredondada para baixo: 99,9% não aparece como 100%.
  const percent = Math.floor((spentCents * 100) / budgetCents)
  const period = monthLabel(month)
  // Quebra de linha no assunto vira injeção de cabeçalho num adaptador SMTP.
  const subjectCategory = category.replace(/\s+/g, ' ')
  const subject = exceeded
    ? `Finboard: orçamento de ${subjectCategory} estourado`
    : `Finboard: orçamento de ${subjectCategory} em ${threshold}%`
  const headline = exceeded
    ? `Você chegou ao limite do orçamento de ${category} em ${period}.`
    : `Você já usou ${percent}% do orçamento de ${category} em ${period}.`
  const detail = `Gasto até agora: ${formatBrl(spentCents)} de ${formatBrl(budgetCents)} (${percent}%).`
  // Exatamente 100% atinge o limite sem passar: não há excedente a mostrar.
  const tail =
    spentCents > budgetCents
      ? `O excedente é de ${formatBrl(spentCents - budgetCents)}.`
      : spentCents === budgetCents
        ? 'Não sobra mais nada do orçamento neste mês.'
        : `Ainda restam ${formatBrl(budgetCents - spentCents)} para o mês.`
  const link = `${appUrl.replace(/\/+$/, '')}/`
  const footer = 'Cada aviso é enviado uma vez por categoria e mês.'

  const text = [
    'Olá!',
    '',
    headline,
    detail,
    tail,
    '',
    `Ver o dashboard: ${link}`,
    '',
    footer,
  ].join('\n')

  const color = exceeded ? '#dc2626' : '#d97706'
  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5">
    <p>Olá!</p>
    <p style="color: ${color}"><strong>${escapeHtml(headline)}</strong></p>
    <p>${escapeHtml(detail)}<br>${escapeHtml(tail)}</p>
    <p>
      <a href="${escapeHtml(link)}" style="display: inline-block; padding: 10px 16px; background: #2563eb; color: #ffffff; border-radius: 6px; text-decoration: none">Ver o dashboard</a>
    </p>
    <p style="color: #6b7280">${footer} Conta: ${escapeHtml(to)}.</p>
  </body>
</html>`

  return { to, subject, text, html }
}
