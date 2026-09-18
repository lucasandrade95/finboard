import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyInstance } from 'fastify'

/** Prefixo da UI; o documento OpenAPI cru fica em `${DOCS_ROUTE}/json`. */
export const DOCS_ROUTE = '/docs'

/**
 * Registra o gerador do documento OpenAPI e a UI de exploração.
 *
 * O documento é montado a partir do `schema` declarado em cada rota. Como o Zod
 * continua sendo quem valida (ver `buildApp`), esses schemas são só descrição:
 * servem para a UI e para gerar cliente, não para aceitar ou recusar requisição.
 */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Finboard API',
        description:
          'API do Finboard — dashboard de finanças pessoais. Valores em centavos (inteiro); ' +
          'meses no formato YYYY-MM e datas em YYYY-MM-DD. Fora de `/health` e `/api/auth/register|login`, ' +
          'toda rota exige `Authorization: Bearer <token>` e responde só com os dados da conta do token.',
        version: '0.1.0',
      },
      tags: [
        { name: 'sistema', description: 'Health check e infraestrutura' },
        { name: 'auth', description: 'Registro, login e usuário do token' },
        { name: 'transações', description: 'Lançamentos, filtros, CSV e agregados do mês' },
        { name: 'orçamentos', description: 'Teto mensal por categoria e gasto acumulado' },
        { name: 'metas', description: 'Metas de economia e aportes' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Token devolvido por `/api/auth/register` ou `/api/auth/login`.',
          },
        },
      },
    },
  })

  await app.register(swaggerUi, {
    routePrefix: DOCS_ROUTE,
    // A UI carrega script e estilo embutidos, que a CSP do helmet barraria; com
    // `staticCSP` o próprio plugin manda a política certa nas respostas dele.
    staticCSP: true,
  })
}
