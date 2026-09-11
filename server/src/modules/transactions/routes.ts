import type { FastifyInstance } from 'fastify'
import { parseTransactionsCsv, transactionsToCsv } from './csv.js'
import type { TransactionsRepository } from './repository.js'
import {
  createTransactionSchema,
  idParamSchema,
  importCsvBodySchema,
  listTransactionsQuerySchema,
  monthQuerySchema,
  requiredMonthQuerySchema,
  updateTransactionSchema,
} from './schemas.js'

// Um arquivo inteiro errado geraria milhares de linhas no relatório: a UI mostra as primeiras.
const MAX_REPORTED_ERRORS = 50

export function registerTransactionRoutes(
  app: FastifyInstance,
  repository: TransactionsRepository,
): void {
  app.get('/api/transactions', async (request) => {
    const { month, type, category, q, limit, offset } = listTransactionsQuerySchema.parse(
      request.query,
    )
    const { items, total } = repository.list({ month, type, category, q, limit, offset })
    return { items, total, limit, offset }
  })

  app.get('/api/transactions/export.csv', async (request, reply) => {
    const { month } = requiredMonthQuerySchema.parse(request.query)
    const csv = transactionsToCsv(repository.listByMonth(month))
    return (
      reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="transacoes-${month}.csv"`)
        // BOM: sem ele o Excel no Windows assume ANSI e quebra a acentuação do UTF-8.
        .send(`\ufeff${csv}`)
    )
  })

  // Upload como corpo text/csv (o front lê o arquivo e envia o texto): sem multipart,
  // sem arquivo temporário em disco. O limite de corpo do Fastify (1 MB) segura o tamanho.
  app.addContentTypeParser('text/csv', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body)
  })

  app.post('/api/transactions/import', async (request, reply) => {
    const csv = importCsvBodySchema.parse(request.body)
    const { rows, errors } = parseTransactionsCsv(csv)
    // Arquivo com qualquer erro não importa nada: corrigir e reenviar não duplica linhas.
    if (errors.length > 0) {
      return reply.code(400).send({
        error: 'invalid_csv',
        errorCount: errors.length,
        errors: errors.slice(0, MAX_REPORTED_ERRORS),
      })
    }
    return reply.code(201).send({ imported: repository.createMany(rows) })
  })

  app.post('/api/transactions', async (request, reply) => {
    const input = createTransactionSchema.parse(request.body)
    const created = repository.create(input)
    return reply.code(201).send(created)
  })

  app.put('/api/transactions/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateTransactionSchema.parse(request.body)
    const updated = repository.updateById(id, input)
    if (!updated) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return updated
  })

  app.delete('/api/transactions/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    if (!repository.deleteById(id)) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return reply.code(204).send()
  })

  app.get('/api/categories', async (request) => {
    const { month } = monthQuerySchema.parse(request.query)
    return { categories: repository.listCategories(month) }
  })

  app.get('/api/expenses-by-category', async (request) => {
    const { month } = monthQuerySchema.parse(request.query)
    return repository.expensesByCategory(month)
  })

  app.get('/api/daily-balance', async (request) => {
    const { month } = requiredMonthQuerySchema.parse(request.query)
    return repository.dailyBalance(month)
  })

  app.get('/api/summary', async (request) => {
    const { month } = monthQuerySchema.parse(request.query)
    return repository.summaryWithComparison(month)
  })
}
