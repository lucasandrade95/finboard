import type { FastifyInstance } from 'fastify'
import { reportDocs } from '../../docs/schemas.js'
import { ownerId, protectedRoute } from '../auth/authenticate.js'
import type { TransactionsRepository } from '../transactions/repository.js'
import { requiredMonthQuerySchema } from '../transactions/schemas.js'
import { renderMonthlyReport } from './monthly-report.js'

export function registerReportRoutes(
  app: FastifyInstance,
  transactions: TransactionsRepository,
): void {
  app.get(
    '/api/reports/monthly.pdf',
    { ...protectedRoute, schema: reportDocs.monthlyPdf },
    async (request, reply) => {
      const { month } = requiredMonthQuerySchema.parse(request.query)
      const userId = ownerId(request)
      // Os mesmos agregados que alimentam os cards e gráficos do dashboard: o PDF não
      // tem regra de cálculo própria, então nunca discorda da tela.
      const pdf = renderMonthlyReport({
        month,
        summary: transactions.summaryWithComparison(userId, month),
        expenses: transactions.expensesByCategory(userId, { month }),
        daily: transactions.dailyBalance(userId, month),
      })
      return (
        reply
          .header('content-type', 'application/pdf')
          .header('content-disposition', `attachment; filename="relatorio-${month}.pdf"`)
          // Dado financeiro pessoal: nenhum cache intermediário guarda o arquivo.
          .header('cache-control', 'private, no-store')
          .send(pdf)
      )
    },
  )
}
