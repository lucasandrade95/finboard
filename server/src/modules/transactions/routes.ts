import type { FastifyInstance } from 'fastify'
import { ownerId, protectedRoute } from '../auth/authenticate.js'
import { parseTransactionsCsv, transactionsToCsv } from './csv.js'
import { transactionDocs } from '../../docs/schemas.js'
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
  app.get(
    '/api/transactions',
    { ...protectedRoute, schema: transactionDocs.list },
    async (request) => {
      const { month, type, category, q, limit, offset } = listTransactionsQuerySchema.parse(
        request.query,
      )
      const { items, total } = repository.list(ownerId(request), {
        month,
        type,
        category,
        q,
        limit,
        offset,
      })
      return { items, total, limit, offset }
    },
  )

  app.get(
    '/api/transactions/export.csv',
    { ...protectedRoute, schema: transactionDocs.exportCsv },
    async (request, reply) => {
      const { month } = requiredMonthQuerySchema.parse(request.query)
      const csv = transactionsToCsv(repository.listByMonth(ownerId(request), month))
      return (
        reply
          .header('content-type', 'text/csv; charset=utf-8')
          .header('content-disposition', `attachment; filename="transacoes-${month}.csv"`)
          // BOM: sem ele o Excel no Windows assume ANSI e quebra a acentuação do UTF-8.
          .send(`\ufeff${csv}`)
      )
    },
  )

  // Upload como corpo text/csv (o front lê o arquivo e envia o texto): sem multipart,
  // sem arquivo temporário em disco. O limite de corpo do Fastify (1 MB) segura o tamanho.
  app.addContentTypeParser('text/csv', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body)
  })

  app.post(
    '/api/transactions/import',
    { ...protectedRoute, schema: transactionDocs.importCsv },
    async (request, reply) => {
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
      return reply.code(201).send({ imported: repository.createMany(ownerId(request), rows) })
    },
  )

  app.post(
    '/api/transactions',
    { ...protectedRoute, schema: transactionDocs.create },
    async (request, reply) => {
      const input = createTransactionSchema.parse(request.body)
      const created = repository.create(ownerId(request), input)
      return reply.code(201).send(created)
    },
  )

  app.put(
    '/api/transactions/:id',
    { ...protectedRoute, schema: transactionDocs.update },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params)
      const input = updateTransactionSchema.parse(request.body)
      const updated = repository.updateById(ownerId(request), id, input)
      // Transação de outra conta cai aqui: o 404 não confirma que o id existe.
      if (!updated) {
        return reply.code(404).send({ error: 'not_found' })
      }
      return updated
    },
  )

  app.delete(
    '/api/transactions/:id',
    { ...protectedRoute, schema: transactionDocs.remove },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params)
      if (!repository.deleteById(ownerId(request), id)) {
        return reply.code(404).send({ error: 'not_found' })
      }
      return reply.code(204).send()
    },
  )

  app.get(
    '/api/categories',
    { ...protectedRoute, schema: transactionDocs.categories },
    async (request) => {
      const { month } = monthQuerySchema.parse(request.query)
      return { categories: repository.listCategories(ownerId(request), month) }
    },
  )

  app.get(
    '/api/expenses-by-category',
    { ...protectedRoute, schema: transactionDocs.expensesByCategory },
    async (request) => {
      const { month } = monthQuerySchema.parse(request.query)
      return repository.expensesByCategory(ownerId(request), month)
    },
  )

  app.get(
    '/api/daily-balance',
    { ...protectedRoute, schema: transactionDocs.dailyBalance },
    async (request) => {
      const { month } = requiredMonthQuerySchema.parse(request.query)
      return repository.dailyBalance(ownerId(request), month)
    },
  )

  app.get(
    '/api/summary',
    { ...protectedRoute, schema: transactionDocs.summary },
    async (request) => {
      const { month } = monthQuerySchema.parse(request.query)
      return repository.summaryWithComparison(ownerId(request), month)
    },
  )
}
