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
const YEAR_PATTERN = '^\\d{4}$'

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

const linkedEntry = errorResponse(
  'Lançamento vinculado: altere ou exclua pela transferência (`transfer_leg`) ' +
    'ou pelo parcelamento (`installment_part`)',
  'transfer_leg',
)

const monthParam = {
  type: 'string',
  pattern: MONTH_PATTERN,
  example: '2026-09',
  description: 'Mês no formato YYYY-MM',
}

// Período customizado: não combina com `month` (400 se vierem juntos).
const periodParams = {
  from: {
    type: 'string',
    pattern: DATE_PATTERN,
    example: '2026-09-01',
    description: 'Data inicial (inclusiva), YYYY-MM-DD',
  },
  to: {
    type: 'string',
    pattern: DATE_PATTERN,
    example: '2026-09-15',
    description: 'Data final (inclusiva), YYYY-MM-DD',
  },
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
  properties: {
    user,
    token: { type: 'string', description: 'JWT HS256 válido por 15 minutos' },
    refreshToken: {
      type: 'string',
      description: 'Opaco, de uso único, válido por 30 dias: troca por um novo par em /refresh',
    },
  },
}

const refreshBody = {
  type: 'object',
  required: ['refreshToken'],
  properties: { refreshToken: { type: 'string', minLength: 1, maxLength: 256 } },
}

const invalidRefreshToken = errorResponse(
  'Refresh token inexistente, vencido, revogado ou já usado',
  'invalid_refresh_token',
)

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
    accountId: { type: ['integer', 'null'], description: 'Conta/carteira; null = sem conta' },
    transferId: {
      type: ['integer', 'null'],
      description: 'Preenchido nas duas pernas de uma transferência entre contas',
    },
    installmentId: {
      type: ['integer', 'null'],
      description: 'Preenchido nas parcelas de uma compra parcelada',
    },
    installmentNumber: {
      type: ['integer', 'null'],
      description: 'Posição da parcela (1 = primeira); null fora de parcelamento',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      example: ['viagem', 'férias'],
      description: 'Tags livres, em ordem alfabética',
    },
    hasAttachment: {
      type: 'boolean',
      description: 'Há comprovante em /api/transactions/{id}/attachment',
    },
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
    accountId: {
      type: ['integer', 'null'],
      description:
        'Conta do próprio usuário (senão 400 em `accountId`). Na criação o padrão é null; ' +
        'na edição, omitir mantém a conta atual.',
    },
    tags: {
      type: 'array',
      maxItems: 10,
      items: { type: 'string', minLength: 1, maxLength: 30, pattern: '^[^,]+$' },
      description:
        'Tags livres (até 10, sem vírgula). Repetidas sem diferenciar maiúsculas entram uma vez. ' +
        'Na criação o padrão é nenhuma; na edição, omitir mantém as atuais e `[]` remove todas.',
    },
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
  description:
    'Rota pública usada por deploy e monitoramento. Faz um `SELECT 1` no banco: 503 se ele não responde.',
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        uptimeSeconds: { type: 'integer', example: 3600 },
        checks: {
          type: 'object',
          properties: { database: { type: 'string', enum: ['ok', 'error'] } },
        },
      },
    },
    503: {
      description: 'Banco indisponível',
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        uptimeSeconds: { type: 'integer' },
        checks: {
          type: 'object',
          properties: { database: { type: 'string', example: 'error' } },
        },
      },
    },
  },
}

export const metricsDocs: FastifySchema = {
  tags: ['sistema'],
  summary: 'Métricas Prometheus',
  description:
    'Formato de texto 0.0.4: requisições por método/rota/status, histograma de latência, ' +
    'banco no ar, uptime e memória. Com `METRICS_TOKEN` definido, exige `Authorization: Bearer <token>`.',
  response: {
    200: { description: 'Exposição Prometheus', type: 'string' },
    401: errorResponse('METRICS_TOKEN definido e token ausente ou errado', 'unauthorized'),
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

  refresh: {
    tags: ['auth'],
    summary: 'Troca o refresh token por um novo par de tokens',
    description:
      'Rotação: o refresh token apresentado deixa de valer. Reapresentar um token já trocado ' +
      'é tratado como roubo e revoga a sessão inteira daquele dispositivo. ' +
      'Limite próprio de 10 requisições por minuto por IP.',
    body: refreshBody,
    response: {
      200: { description: 'Sessão renovada', ...session },
      400: validationError,
      401: invalidRefreshToken,
    },
  } satisfies FastifySchema,

  logout: {
    tags: ['auth'],
    summary: 'Encerra a sessão deste dispositivo',
    description:
      'Revoga o refresh token e todas as rotações dele. Não exige JWT: funciona mesmo com o ' +
      'access token vencido. Token desconhecido também responde 204.',
    body: refreshBody,
    response: { 204: { description: 'Sessão encerrada', type: 'null' }, 400: validationError },
  } satisfies FastifySchema,

  logoutAll: {
    ...authenticated,
    tags: ['auth'],
    summary: 'Encerra a sessão em todos os dispositivos',
    description:
      'Revoga todos os refresh tokens da conta, inclusive o deste dispositivo. Access tokens já ' +
      'emitidos continuam valendo até vencer (no máximo 15 minutos).',
    response: {
      200: {
        description: 'Sessões encerradas',
        type: 'object',
        properties: { revokedSessions: { type: 'integer', example: 3 } },
      },
      401: unauthorized,
    },
  } satisfies FastifySchema,

  forgotPassword: {
    tags: ['auth'],
    summary: 'Pede o e-mail de recuperação de senha',
    description:
      'Responde 202 exista a conta ou não, para a rota não revelar quais e-mails estão ' +
      'cadastrados. O link vale 30 minutos, é de uso único e invalida os pedidos anteriores. ' +
      'Limite próprio de 10 requisições por minuto por IP.',
    body: {
      type: 'object',
      required: ['email'],
      properties: { email: { type: 'string', format: 'email', maxLength: 254 } },
    },
    response: {
      202: { description: 'Pedido aceito', type: 'null' },
      400: validationError,
    },
  } satisfies FastifySchema,

  resetPassword: {
    tags: ['auth'],
    summary: 'Troca a senha usando o token do e-mail',
    description:
      'Grava a senha nova e encerra as sessões de todos os dispositivos da conta. ' +
      'Limite próprio de 10 requisições por minuto por IP.',
    body: {
      type: 'object',
      required: ['token', 'password'],
      properties: {
        token: { type: 'string', minLength: 1, maxLength: 256 },
        password: { type: 'string', minLength: 8, maxLength: 128 },
      },
    },
    response: {
      204: { description: 'Senha trocada', type: 'null' },
      400: {
        description: 'Corpo inválido, ou token inexistente, vencido ou já usado',
        type: 'object',
        properties: { error: { type: 'string', example: 'invalid_reset_token' } },
        required: ['error'],
      },
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
        ...periodParams,
        type: { type: 'string', enum: ['income', 'expense'] },
        category: { type: 'string', maxLength: 50 },
        q: { type: 'string', maxLength: 100, description: 'Busca na descrição' },
        tag: {
          type: 'string',
          maxLength: 30,
          description: 'Só transações com esta tag (sem diferenciar maiúsculas)',
        },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        offset: { type: 'integer', minimum: 0, default: 0 },
        sort: {
          type: 'string',
          enum: ['date', 'amount', 'category'],
          default: 'date',
          description: 'Coluna da ordenação; empates caem na data mais recente',
        },
        order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
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
      409: linkedEntry,
    },
  } satisfies FastifySchema,

  remove: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Exclui transação',
    params: { type: 'object', properties: { id: { type: 'integer' } } },
    response: { 204: noContent, 401: unauthorized, 404: notFound, 409: linkedEntry },
  } satisfies FastifySchema,

  history: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Histórico de alterações da transação (quem, quando, o quê)',
    description:
      'Do mais recente ao mais antigo. Continua disponível depois que a transação é excluída.',
    params: { type: 'object', properties: { id: { type: 'integer' } } },
    response: {
      200: {
        description: 'Registros de auditoria',
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                transactionId: { type: 'integer' },
                action: { type: 'string', enum: ['created', 'updated', 'deleted'] },
                changes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string', example: 'amountCents' },
                      // Sem `type`: o valor segue o campo (texto, centavos, booleano, lista ou null).
                      from: { description: 'Valor anterior (null na criação)', example: 4590 },
                      to: { description: 'Valor novo (null na exclusão)', example: 5290 },
                    },
                  },
                },
                actor: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' },
                    email: { type: 'string', format: 'email', example: 'lucas@example.com' },
                  },
                },
                at: { type: 'string', example: '2026-10-16T12:00:00Z' },
              },
            },
          },
        },
      },
      401: unauthorized,
      404: notFound,
    },
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

  tags: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Tags em uso nas transações',
    response: {
      200: {
        description: 'Tags ligadas a pelo menos uma transação, em ordem alfabética',
        type: 'object',
        properties: { tags: { type: 'array', items: { type: 'string' } } },
      },
      401: unauthorized,
    },
  } satisfies FastifySchema,

  expensesByCategory: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Total de despesas por categoria',
    querystring: { type: 'object', properties: { month: monthParam, ...periodParams } },
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

  yearlySummary: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Receitas × despesas por mês do ano',
    description:
      'Sempre 12 meses, de janeiro a dezembro, inclusive os sem movimento. ' +
      'Transferências entre contas ficam de fora.',
    querystring: {
      type: 'object',
      required: ['year'],
      properties: {
        year: { type: 'string', pattern: YEAR_PATTERN, example: '2026', description: 'Ano (YYYY)' },
      },
    },
    response: {
      200: {
        description: 'Totais mensais e do ano',
        type: 'object',
        properties: {
          year: { type: 'string', pattern: YEAR_PATTERN },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                month: { type: 'string', pattern: MONTH_PATTERN },
                incomeCents: { type: 'integer' },
                expenseCents: { type: 'integer' },
                netCents: { type: 'integer', description: 'Resultado do mês' },
              },
            },
          },
          incomeCents: { type: 'integer' },
          expenseCents: { type: 'integer' },
          netCents: { type: 'integer' },
        },
      },
      401: unauthorized,
    },
  } satisfies FastifySchema,

  summary: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Receitas, despesas e saldo do período',
    description:
      'Com `month`, inclui `previous` com o resumo do mês anterior para comparação. ' +
      '`accounts` traz o saldo acumulado de cada conta até o fim do mês (ou até hoje, sem `month`).',
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
          accounts: {
            type: 'array',
            description: 'Saldo por conta: saldo inicial + lançamentos até o fim do período',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                name: { type: 'string', example: 'Conta corrente' },
                balanceCents: { type: 'integer' },
              },
            },
          },
        },
      },
      401: unauthorized,
    },
  } satisfies FastifySchema,
}

const attachmentTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
const transactionIdParam = { type: 'object', properties: { id: { type: 'integer' } } }

export const attachmentDocs = {
  upload: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Anexa (ou troca) o comprovante da transação',
    description:
      'Corpo binário cru com o Content-Type do arquivo (PNG, JPEG, WebP ou PDF), até 2 MB. ' +
      'Os primeiros bytes precisam bater com o tipo declarado.',
    consumes: attachmentTypes,
    params: transactionIdParam,
    body: { type: 'string', format: 'binary' },
    response: {
      200: {
        description: 'Comprovante salvo',
        type: 'object',
        properties: {
          transactionId: { type: 'integer' },
          mimeType: { type: 'string', enum: attachmentTypes },
          sizeBytes: { type: 'integer', example: 184320 },
          uploadedAt: { type: 'string', example: '2026-10-14 12:00:00' },
        },
      },
      400: errorResponse('Arquivo vazio ou conteúdo diferente do tipo declarado', 'invalid_file'),
      401: unauthorized,
      404: notFound,
      413: errorResponse('Arquivo acima de 2 MB', 'payload_too_large'),
      415: errorResponse('Tipo fora de PNG, JPEG, WebP ou PDF', 'unsupported_media_type'),
    },
  } satisfies FastifySchema,

  // Sem schema no 200: o corpo é o próprio arquivo, não JSON.
  download: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Baixa o comprovante da transação',
    produces: attachmentTypes,
    params: transactionIdParam,
    response: { 401: unauthorized, 404: notFound },
  } satisfies FastifySchema,

  remove: {
    ...authenticated,
    tags: ['transações'],
    summary: 'Remove o comprovante da transação',
    params: transactionIdParam,
    response: { 204: noContent, 401: unauthorized, 404: notFound },
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

const category = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string', example: 'mercado' },
    color: { type: 'string', pattern: '^#[0-9a-f]{6}$', example: '#16a34a' },
    icon: { type: ['string', 'null'], example: '🛒' },
    createdAt: { type: 'string' },
  },
}

const categoryBody = {
  type: 'object',
  required: ['name', 'color'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 50 },
    color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: 'Hex #rrggbb' },
    icon: { type: ['string', 'null'], maxLength: 8, default: null },
  },
}

const categoryExists = errorResponse(
  'Já existe categoria com esse nome na conta',
  'category_exists',
)

export const categoryDocs = {
  list: {
    ...authenticated,
    tags: ['categorias'],
    summary: 'Catálogo de categorias',
    description: 'Categorias cadastradas pela conta, com cor e ícone, em ordem alfabética.',
    response: {
      200: {
        description: 'Categorias da conta',
        type: 'object',
        properties: { items: { type: 'array', items: category } },
      },
      401: unauthorized,
    },
  } satisfies FastifySchema,

  create: {
    ...authenticated,
    tags: ['categorias'],
    summary: 'Cadastra categoria',
    body: categoryBody,
    response: {
      201: { description: 'Categoria criada', ...category },
      400: validationError,
      401: unauthorized,
      409: categoryExists,
    },
  } satisfies FastifySchema,

  update: {
    ...authenticated,
    tags: ['categorias'],
    summary: 'Atualiza categoria',
    description: 'Renomear propaga o novo nome para as transações e o orçamento da categoria.',
    params: { type: 'object', properties: { id: { type: 'integer' } } },
    body: categoryBody,
    response: {
      200: { description: 'Categoria atualizada', ...category },
      400: validationError,
      401: unauthorized,
      404: notFound,
      409: categoryExists,
    },
  } satisfies FastifySchema,

  remove: {
    ...authenticated,
    tags: ['categorias'],
    summary: 'Remove categoria do catálogo',
    description: 'As transações mantêm o nome; ele só deixa de ter cor e ícone.',
    params: { type: 'object', properties: { id: { type: 'integer' } } },
    response: { 204: noContent, 401: unauthorized, 404: notFound },
  } satisfies FastifySchema,
}

const account = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string', example: 'Conta corrente' },
    openingBalanceCents: { type: 'integer', description: 'Saldo de partida; pode ser negativo' },
    balanceCents: { type: 'integer', description: 'Saldo inicial + todos os lançamentos da conta' },
    createdAt: { type: 'string' },
  },
}

const accountBody = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 50 },
    openingBalanceCents: { type: 'integer', default: 0 },
  },
}

const accountExists = errorResponse('Já existe conta com esse nome', 'account_exists')

export const accountDocs = {
  list: {
    ...authenticated,
    tags: ['contas'],
    summary: 'Contas/carteiras com saldo atual',
    description: 'Em ordem alfabética. O saldo é calculado na leitura, nunca gravado.',
    response: {
      200: {
        description: 'Contas do usuário',
        type: 'object',
        properties: { items: { type: 'array', items: account } },
      },
      401: unauthorized,
    },
  } satisfies FastifySchema,

  create: {
    ...authenticated,
    tags: ['contas'],
    summary: 'Cadastra conta',
    body: accountBody,
    response: {
      201: { description: 'Conta criada', ...account },
      400: validationError,
      401: unauthorized,
      409: accountExists,
    },
  } satisfies FastifySchema,

  update: {
    ...authenticated,
    tags: ['contas'],
    summary: 'Renomeia conta ou ajusta o saldo inicial',
    params: { type: 'object', properties: { id: { type: 'integer' } } },
    body: accountBody,
    response: {
      200: { description: 'Conta atualizada', ...account },
      400: validationError,
      401: unauthorized,
      404: notFound,
      409: accountExists,
    },
  } satisfies FastifySchema,

  remove: {
    ...authenticated,
    tags: ['contas'],
    summary: 'Remove conta',
    description: 'Os lançamentos da conta não são apagados: passam a ficar sem conta.',
    params: { type: 'object', properties: { id: { type: 'integer' } } },
    response: { 204: noContent, 401: unauthorized, 404: notFound },
  } satisfies FastifySchema,
}

const transfer = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    fromAccountId: { type: ['integer', 'null'], description: 'null se a conta foi excluída' },
    toAccountId: { type: ['integer', 'null'], description: 'null se a conta foi excluída' },
    amountCents: { type: 'integer', example: 50000 },
    occurredOn: { type: 'string', pattern: DATE_PATTERN, example: '2026-10-04' },
    description: { type: 'string', example: 'Transferência' },
    createdAt: { type: 'string' },
  },
}

export const transferDocs = {
  list: {
    ...authenticated,
    tags: ['transferências'],
    summary: 'Transferências entre contas',
    description: 'Mais recentes primeiro. Com `month`, só as do mês.',
    querystring: { type: 'object', properties: { month: monthParam } },
    response: {
      200: {
        description: 'Transferências do usuário',
        type: 'object',
        properties: { items: { type: 'array', items: transfer } },
      },
      400: validationError,
      401: unauthorized,
    },
  } satisfies FastifySchema,

  create: {
    ...authenticated,
    tags: ['transferências'],
    summary: 'Transfere entre duas contas',
    description:
      'Grava um par de lançamentos vinculados (saída na origem, entrada no destino) que ' +
      'muda o saldo das duas contas e fica fora dos totais de receita e despesa.',
    body: {
      type: 'object',
      required: ['fromAccountId', 'toAccountId', 'amountCents', 'occurredOn'],
      properties: {
        fromAccountId: { type: 'integer', description: 'Conta do próprio usuário' },
        toAccountId: { type: 'integer', description: 'Diferente da origem' },
        amountCents: { type: 'integer', minimum: 1, description: 'Centavos, sempre positivo' },
        occurredOn: { type: 'string', pattern: DATE_PATTERN },
        description: { type: 'string', minLength: 1, maxLength: 200, default: 'Transferência' },
      },
    },
    response: {
      201: { description: 'Transferência criada', ...transfer },
      400: validationError,
      401: unauthorized,
    },
  } satisfies FastifySchema,

  remove: {
    ...authenticated,
    tags: ['transferências'],
    summary: 'Desfaz transferência',
    description: 'Remove os dois lançamentos juntos.',
    params: { type: 'object', properties: { id: { type: 'integer' } } },
    response: { 204: noContent, 401: unauthorized, 404: notFound },
  } satisfies FastifySchema,
}

const installment = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    description: { type: 'string', example: 'Notebook' },
    totalCents: { type: 'integer', example: 350000 },
    installmentCount: { type: 'integer', example: 10 },
    category: { type: 'string', example: 'eletrônicos' },
    accountId: { type: ['integer', 'null'], description: 'null = sem conta' },
    firstDueOn: { type: 'string', pattern: DATE_PATTERN, example: '2026-10-15' },
    lastDueOn: { type: 'string', pattern: DATE_PATTERN, example: '2027-07-15' },
    createdAt: { type: 'string' },
  },
}

export const installmentDocs = {
  list: {
    ...authenticated,
    tags: ['parcelamentos'],
    summary: 'Compras parceladas',
    description: 'Todas as compras parceladas do usuário, da primeira parcela mais recente.',
    response: {
      200: {
        description: 'Parcelamentos do usuário',
        type: 'object',
        properties: { items: { type: 'array', items: installment } },
      },
      401: unauthorized,
    },
  } satisfies FastifySchema,

  create: {
    ...authenticated,
    tags: ['parcelamentos'],
    summary: 'Registra compra parcelada',
    description:
      'Gera uma despesa por parcela, mês a mês a partir de `firstDueOn` (dia limitado ao fim ' +
      'do mês). As parcelas somam exatamente o total; a sobra de centavos vai na primeira.',
    body: {
      type: 'object',
      required: ['description', 'totalCents', 'installmentCount', 'firstDueOn'],
      properties: {
        description: { type: 'string', minLength: 1, maxLength: 190 },
        totalCents: { type: 'integer', minimum: 2, description: 'Centavos, valor total da compra' },
        installmentCount: { type: 'integer', minimum: 2, maximum: 48 },
        firstDueOn: { type: 'string', pattern: DATE_PATTERN },
        category: { type: 'string', minLength: 1, maxLength: 50, default: 'geral' },
        accountId: { type: ['integer', 'null'], description: 'Conta do próprio usuário' },
        tags: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 30 } },
      },
    },
    response: {
      201: { description: 'Parcelamento criado', ...installment },
      400: validationError,
      401: unauthorized,
    },
  } satisfies FastifySchema,

  remove: {
    ...authenticated,
    tags: ['parcelamentos'],
    summary: 'Cancela compra parcelada',
    description: 'Remove o parcelamento e todas as parcelas juntos.',
    params: { type: 'object', properties: { id: { type: 'integer' } } },
    response: { 204: noContent, 401: unauthorized, 404: notFound },
  } satisfies FastifySchema,
}

const dailyPoint = {
  type: 'object',
  properties: {
    date: { type: 'string', pattern: DATE_PATTERN },
    incomeCents: { type: 'integer' },
    expenseCents: { type: 'integer' },
    netCents: { type: 'integer', description: 'Resultado previsto do dia' },
    balanceCents: { type: 'integer', description: 'Saldo previsto ao fim do dia' },
  },
}

const projectionEvent = {
  type: 'object',
  properties: {
    date: { type: 'string', pattern: DATE_PATTERN },
    type: { type: 'string', enum: ['income', 'expense'] },
    description: { type: 'string' },
    category: { type: 'string' },
    amountCents: { type: 'integer' },
    source: {
      type: 'string',
      enum: ['scheduled', 'installment', 'recurring'],
      description:
        '`scheduled`: lançamento já gravado com data futura; `installment`: parcela; ' +
        '`recurring`: cópia prevista de série recorrente, ainda não gravada',
    },
  },
}

export const reportDocs = {
  // Sem schema no 200: o corpo é o próprio PDF, não JSON.
  monthlyPdf: {
    ...authenticated,
    tags: ['relatórios'],
    summary: 'Relatório mensal em PDF',
    description:
      'Uma página A4 com resumo (e variação contra o mês anterior), receitas × despesas, ' +
      'saldo dia a dia e as 5 maiores categorias de despesa.',
    produces: ['application/pdf'],
    querystring: { type: 'object', required: ['month'], properties: { month: monthParam } },
    response: { 400: validationError, 401: unauthorized },
  } satisfies FastifySchema,
}

export const privacyDocs = {
  // Sem schema no 200: o corpo vai como arquivo para baixar, com Content-Disposition.
  exportData: {
    ...authenticated,
    tags: ['privacidade'],
    summary: 'Exporta todos os dados da conta (JSON)',
    description:
      'Portabilidade (LGPD): usuário, contas, categorias, transações com tags, comprovantes ' +
      'em base64, transferências, parcelamentos, orçamentos, metas e histórico de alterações. ' +
      'Valores em centavos; o hash da senha e os tokens de sessão nunca saem.',
    produces: ['application/json'],
    response: { 401: unauthorized },
  } satisfies FastifySchema,

  deleteAccount: {
    ...authenticated,
    tags: ['privacidade'],
    summary: 'Exclui a conta e todos os dados dela',
    description:
      'Eliminação (LGPD): exige a senha atual e apaga tudo numa transação só, inclusive ' +
      'sessões e histórico. Irreversível. Limite de 10 requisições por minuto por IP.',
    body: {
      type: 'object',
      required: ['password'],
      properties: { password: { type: 'string', minLength: 1, maxLength: 128 } },
    },
    response: {
      204: { description: 'Conta excluída', type: 'null' },
      400: validationError,
      401: unauthorized,
      403: errorResponse('Senha atual incorreta', 'invalid_password'),
    },
  } satisfies FastifySchema,
}

export const projectionDocs = {
  get: {
    ...authenticated,
    tags: ['projeção'],
    summary: 'Projeção de saldo dos próximos dias',
    description:
      'Parte do saldo de hoje (saldo inicial das contas + lançamentos até `from`) e soma, dia a dia, os lançamentos já ' +
      'gravados com data futura (parcelas incluídas) e as próximas cópias das séries ' +
      'recorrentes. Transferências entre contas ficam fora. Nada previsto é gravado.',
    querystring: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          pattern: DATE_PATTERN,
          description: 'Dia de referência ("hoje"); default: data local do servidor',
        },
        days: { type: 'integer', minimum: 1, maximum: 90, default: 30 },
      },
    },
    response: {
      200: {
        description: 'Saldo previsto',
        type: 'object',
        properties: {
          from: { type: 'string', pattern: DATE_PATTERN },
          to: { type: 'string', pattern: DATE_PATTERN },
          startingBalanceCents: { type: 'integer' },
          endingBalanceCents: { type: 'integer' },
          lowestBalanceCents: { type: 'integer' },
          lowestBalanceOn: { type: 'string', pattern: DATE_PATTERN },
          events: { type: 'array', items: projectionEvent },
          items: { type: 'array', items: dailyPoint },
        },
      },
      400: validationError,
      401: unauthorized,
    },
  } satisfies FastifySchema,
}
