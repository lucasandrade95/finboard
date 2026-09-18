import type { FastifySchema } from 'fastify'

/**
 * Descrição das rotas para o documento OpenAPI.
 *
 * Fica fora dos módulos de rota de propósito: a fonte da verdade da validação
 * é o Zod de cada módulo, e misturar os dois arquivos daria a impressão de que
 * este aqui recusa requisição — ele só documenta.
 */

const MONTH_PATTERN = '^\\d{4}-\\d{2}$'
const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$'

const authenticated = { security: [{ bearerAuth: [] }] }

function errorResponse(description: string, example: string) {
  return {
    description,
    type: 'object',
    properties: { error: { type: 'string', example } },
    required: ['error'],
  }
}

const unauthorized = errorResponse('Token ausente, inválido ou expirado', 'unauthorized')
const notFound = errorResponse('Registro inexistente — ou de outra conta', 'not_found')

const validationError = {
  description: 'Corpo, rota ou query fora do formato esperado',
  type: 'object',
  properties: {
    error: { type: 'string', example: 'validation_error' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string', example: 'amountCents' },
          message: { type: 'string', example: 'Expected number, received string' },
        },
      },
    },
  },
}

const noContent = { description: 'Removido', type: 'null' }

const monthParam = {
  type: 'string',
  pattern: MONTH_PATTERN,
  example: '2026-09',
  description: 'Mês no formato YYYY-MM',
}

const user = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    email: { type: 'string', format: 'email', example: 'lucas@example.com' },
    createdAt: { type: 'string', example: '2026-09-18 12:00:00' },
  },
}

const session = {
  type: 'object',
  properties: { user, token: { type: 'string', description: 'JWT HS256 válido por 7 dias' } },
}

const transaction = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    type: { type: 'string', enum: ['income', 'expense'] },
    description: { type: 'string', example: 'Mercado do mês' },
    amountCents: { type: 'integer', example: 32990, description: 'Valor em centavos (inteiro)' },
    category: { type: 'string', example: 'mercado' },
    occurredOn: { type: 'string', pattern: DATE_PATTERN, example: '2026-09-18' },
    recurring: { type: 'boolean', description: 'Série que ganha cópia mensal no boot da API' },
    createdAt: { type: 'string', example: '2026-09-18 12:00:00' },
  },
}

const transactionBody = {
  type: 'object',
  required: ['type', 'description', 'amountCents', 'occurredOn'],
  properties: {
    type: { type: 'string', enum: ['income', 'expense'] },
    description: { type: 'string', minLength: 1, maxLength: 200 },
    amountCents: { type: 'integer', minimum: 1, description: 'Centavos, sempre positivo' },
    category: { type: 'string', minLength: 1, maxLength: 50, default: 'geral' },
    occurredOn: { type: 'string', pattern: DATE_PATTERN },
    recurring: { type: 'boolean', default: false },
  },
}

const monthlySummary = {
  incomeCents: { type: 'integer' },
  expenseCents: { type: 'integer' },
  balanceCents: { type: 'integer', description: 'Receitas − despesas' },
}

const goal = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string', example: 'Fundo de emergência' },
    targetCents: { type: 'integer' },
    savedCents: { type: 'integer' },
    deadline: { type: ['string', 'null'], pattern: DATE_PATTERN, example: '2026-12-31' },
    createdAt: { type: 'string' },
  },
}

const goalBody = {
  type: 'object',
  required: ['name', 'targetCents'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    targetCents: { type: 'integer', minimum: 1 },
    savedCents: { type: 'integer', minimum: 0, default: 0 },
    deadline: {
      type: ['string', 'null'],
      pattern: DATE_PATTERN,
      default: null,
      description: 'Meta sem prazo é válida (fundo de emergência, por exemplo)',
    },
  },
}

const amountBody = {
  type: 'object',
  required: ['amountCents'],
  properties: { amountCents: { type: 'integer', minimum: 1, description: 'Centavos' } },
}

export const healthDocs: FastifySchema = {
  tags: ['sistema'],
  summary: 'Health check',
  description: 'Rota pública usada por deploy e monitoramento.',
  response: {
    200: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } },
  },
}

export const authDocs = {
  register: {
    tags: ['auth'],
    summary: 'Cria conta',
    description: 'Senha vira hash argon2id. Limite próprio de 10 requisições por minuto por IP.',
    body: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', maxLength: 254 },
        password: { type: 'string', minLength: 8, maxLength: 128 },
      },
    },
    response: {
      201: { description: 'Conta criada', ...session },
      400: validationError,
      409: errorResponse('E-mail já cadastrado', 'email_taken'),
    },
  } satisfies FastifySchema,

  login: {
    tags: ['auth'],
    summary: 'Troca e-mail e senha por um token',
    description:
      'E-mail inexistente e senha errada respondem o mesmo 401, com o mesmo custo de hash. ' +
      'Limite próprio de 10 requisições por minuto por IP.',
    body: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 1, maxLength: 128 },
      },
    },
    response: {
      200: { description: 'Sessão aberta', ...session },
      401: errorResponse('Credenciais inválidas', 'invalid_credentials'),
    },
  } satisfies FastifySchema,

  me: {
    ...authenticated,
    tags: ['auth'],
    summary: 'Usuário do token',
    response: {
      200: { description: 'Usuário autenticado', type: 'object', properties: { user } },
      401: unauthorized,
    },
  } satisfies FastifySchema,
}

export const transactionDocs = {
  list: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Lista transações paginadas',
    querystring: {
      type: 'object',
      properties: {
        month: monthParam,
        type: { type: 'string', enum: ['income', 'expense'] },
        category: { type: 'string', maxLength: 50 },
        q: { type: 'string', maxLength: 100, description: 'Busca na descrição' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      },
    },
    response: {
      200: {
        description: 'Página de transações e o total que casa com os filtros',
        type: 'object',
        properties: {
          items: { type: 'array', items: transaction },
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
        },
      },
      401: unauthorized,
    },
  } satisfies FastifySchema,

  create: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Cria transação',
    body: transactionBody,
    response: {
      201: { description: 'Transação criada', ...transaction },
      400: validationError,
      401: unauthorized,
    },
  } satisfies FastifySchema,

  update: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Atualiza transação',
    params: { type: 'object', properties: { id: { type: 'integer' } } },
    body: transactionBody,
    response: {
      200: { description: 'Transação atualizada', ...transaction },
      400: validationError,
      401: unauthorized,
      404: notFound,
    },
  } satisfies FastifySchema,

  remove: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Exclui transação',
    params: { type: 'object', properties: { id: { type: 'integer' } } },
    response: { 204: noContent, 401: unauthorized, 404: notFound },
  } satisfies FastifySchema,

  // Sem schema de resposta: o corpo é CSV, não JSON.
  exportCsv: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Exporta o mês em CSV',
    description: 'Separador `;`, vírgula decimal e BOM — abre direto no Excel pt-BR.',
    produces: ['text/csv'],
    querystring: { type: 'object', required: ['month'], properties: { month: monthParam } },
  } satisfies FastifySchema,

  importCsv: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Importa CSV no formato do export',
    description:
      'Corpo `text/csv`. Tudo ou nada: qualquer linha inválida cancela a importação inteira.',
    consumes: ['text/csv'],
    body: { type: 'string' },
    response: {
      201: {
        description: 'Importado',
        type: 'object',
        properties: { imported: { type: 'integer' } },
      },
      400: {
        description: 'CSV inválido — nada foi importado',
        type: 'object',
        properties: {
          error: { type: 'string', example: 'invalid_csv' },
          errorCount: { type: 'integer' },
          errors: {
            type: 'array',
            description: 'Primeiros 50 erros, com linha e coluna',
            items: {
              type: 'object',
              properties: {
                line: { type: 'integer' },
                column: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      401: unauthorized,
    },
  } satisfies FastifySchema,

  categories: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Categorias distintas usadas no período',
    querystring: { type: 'object', properties: { month: monthParam } },
    response: {
      200: {
        description: 'Categorias em ordem alfabética',
        type: 'object',
        properties: { categories: { type: 'array', items: { type: 'string' } } },
      },
      401: unauthorized,
    },
  } satisfies FastifySchema,

  expensesByCategory: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Total de despesas por categoria',
    querystring: { type: 'object', properties: { month: monthParam } },
    response: {
      200: {
        description: 'Categorias da maior despesa para a menor',
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { category: { type: 'string' }, totalCents: { type: 'integer' } },
            },
          },
          totalCents: { type: 'integer' },
        },
      },
      401: unauthorized,
    },
  } satisfies FastifySchema,

  dailyBalance: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Saldo acumulado dia a dia',
    description: 'Um ponto por dia do mês, inclusive nos dias sem movimento.',
    querystring: { type: 'object', required: ['month'], properties: { month: monthParam } },
    response: {
      200: {
        description: 'Série diária do mês',
        type: 'object',
        properties: {
          month: { type: 'string', pattern: MONTH_PATTERN },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string', pattern: DATE_PATTERN },
                incomeCents: { type: 'integer' },
                expenseCents: { type: 'integer' },
                netCents: { type: 'integer', description: 'Resultado do próprio dia' },
                balanceCents: { type: 'integer', description: 'Acumulado até o dia' },
              },
            },
          },
        },
      },
      401: unauthorized,
    },
  } satisfies FastifySchema,

  summary: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Receitas, despesas e saldo do período',
    description: 'Com `month`, inclui `previous` com o resumo do mês anterior para comparação.',
    querystring: { type: 'object', properties: { month: monthParam } },
    response: {
      200: {
        description: 'Resumo do período',
        type: 'object',
        properties: {
          ...monthlySummary,
          previous: {
            type: 'object',
            description: 'Só quando o resumo é de um mês específico',
            properties: { month: { type: 'string', pattern: MONTH_PATTERN }, ...monthlySummary },
          },
        },
      },
      401: unauthorized,
    },
  } satisfies FastifySchema,
}

export const budgetDocs = {
  list: {
    ...authenticated,
    tags: ['orçamentos'],
    summary: 'Orçamentos com o gasto do mês',
    querystring: { type: 'object', required: ['month'], properties: { month: monthParam } },
    response: {
      200: {
        description: 'Teto e gasto por categoria',
        type: 'object',
        properties: {
          month: { type: 'string', pattern: MONTH_PATTERN },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                category: { type: 'string' },
                budgetCents: { type: 'integer' },
                spentCents: { type: 'integer' },
              },
            },
          },
        },
      },
      401: unauthorized,
    },
  } satisfies FastifySchema,

  upsert: {
    ...authenticated,
    tags: ['orçamentos'],
    summary: 'Define ou ajusta o teto mensal da categoria',
    description: 'Upsert: definir e ajustar são a mesma ação para quem usa.',
    params: { type: 'object', properties: { category: { type: 'string', maxLength: 50 } } },
    body: amountBody,
    response: {
      200: {
        description: 'Orçamento salvo',
        type: 'object',
        properties: { category: { type: 'string' }, amountCents: { type: 'integer' } },
      },
      400: validationError,
      401: unauthorized,
    },
  } satisfies FastifySchema,

  remove: {
    ...authenticated,
    tags: ['orçamentos'],
    summary: 'Remove o orçamento da categoria',
    params: { type: 'object', properties: { category: { type: 'string', maxLength: 50 } } },
    response: { 204: noContent, 401: unauthorized, 404: notFound },
  } satisfies FastifySchema,
}

export const goalDocs = {
  list: {
    ...authenticated,
    tags: ['metas'],
    summary: 'Metas de economia',
    description: 'Prazo mais próximo primeiro; metas sem prazo por último.',
    response: {
      200: {
        description: 'Metas da conta',
        type: 'object',
        properties: { items: { type: 'array', items: goal } },
      },
      401: unauthorized,
    },
  } satisfies FastifySchema,

  create: {
    ...authenticated,
    tags: ['metas'],
    summary: 'Cria meta',
    body: goalBody,
    response: {
      201: { description: 'Meta criada', ...goal },
      400: validationError,
      401: unauthorized,
    },
  } satisfies FastifySchema,

  update: {
    ...authenticated,
    tags: ['metas'],
    summary: 'Atualiza meta',
    params: { type: 'object', properties: { id: { type: 'integer' } } },
    body: goalBody,
    response: {
      200: { description: 'Meta atualizada', ...goal },
      400: validationError,
      401: unauthorized,
      404: notFound,
    },
  } satisfies FastifySchema,

  contribute: {
    ...authenticated,
    tags: ['metas'],
    summary: 'Registra aporte na meta',
    description: 'Soma ao guardado no banco — o cliente manda só o quanto guardou agora.',
    params: { type: 'object', properties: { id: { type: 'integer' } } },
    body: amountBody,
    response: {
      200: { description: 'Meta com o novo guardado', ...goal },
      401: unauthorized,
      404: notFound,
    },
  } satisfies FastifySchema,

  remove: {
    ...authenticated,
    tags: ['metas'],
    summary: 'Remove meta',
    params: { type: 'object', properties: { id: { type: 'integer' } } },
    response: { 204: noContent, 401: unauthorized, 404: notFound },
  } satisfies FastifySchema,
}
