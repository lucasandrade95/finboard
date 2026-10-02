import { BudgetsRepository } from '../modules/budgets/repository.js'
import { GoalsRepository } from '../modules/goals/repository.js'
import type { CreateGoalInput } from '../modules/goals/schemas.js'
import { previousMonth, TransactionsRepository } from '../modules/transactions/repository.js'
import type { CreateTransactionInput } from '../modules/transactions/schemas.js'
import type { AppDatabase } from './connection.js'

/** Conta de demonstração: credenciais públicas de propósito (README e saída do script). */
export const DEMO_EMAIL = 'demo@finboard.dev'
export const DEMO_PASSWORD = 'demo-finboard-123'

/** Quantos meses de histórico a demo cobre, contando o mês de referência. */
export const DEMO_MONTHS = 3

export interface DemoBudget {
  category: string
  amountCents: number
}

export interface DemoData {
  transactions: CreateTransactionInput[]
  budgets: DemoBudget[]
  goals: CreateGoalInput[]
}

export interface SeedResult {
  userId: number
  transactions: number
  budgets: number
  goals: number
}

interface MonthlyEntry {
  type: CreateTransactionInput['type']
  description: string
  category: string
  day: number
  /** Um valor por mês, do mais antigo ao de referência: gasto real oscila mês a mês. */
  amountsCents: readonly [number, number, number]
}

// Contas fixas do mês. Marcadas como recorrentes, então o boot continua gerando
// os meses seguintes a partir delas — a demo não "acaba" depois de 3 meses.
const RECURRING: readonly MonthlyEntry[] = [
  {
    type: 'income',
    description: 'Salário',
    category: 'salário',
    day: 5,
    amountsCents: [850000, 850000, 850000],
  },
  {
    type: 'expense',
    description: 'Aluguel',
    category: 'moradia',
    day: 10,
    amountsCents: [220000, 220000, 220000],
  },
  {
    type: 'expense',
    description: 'Academia',
    category: 'saúde',
    day: 8,
    amountsCents: [11990, 11990, 11990],
  },
  {
    type: 'expense',
    description: 'Internet fibra',
    category: 'contas',
    day: 15,
    amountsCents: [9990, 9990, 9990],
  },
  {
    type: 'expense',
    description: 'Streaming',
    category: 'lazer',
    day: 20,
    amountsCents: [5590, 5590, 5590],
  },
]

// Gastos do dia a dia, com valores quebrados como num extrato de verdade.
const VARIABLE: readonly MonthlyEntry[] = [
  {
    type: 'expense',
    description: 'Show no fim de semana',
    category: 'lazer',
    day: 1,
    amountsCents: [0, 0, 18000],
  },
  {
    type: 'expense',
    description: 'Supermercado',
    category: 'mercado',
    day: 3,
    amountsCents: [38742, 41215, 35980],
  },
  {
    type: 'expense',
    description: 'Padaria',
    category: 'mercado',
    day: 7,
    amountsCents: [4850, 3920, 5130],
  },
  {
    type: 'expense',
    description: 'Conta de luz',
    category: 'contas',
    day: 12,
    amountsCents: [18734, 21456, 19872],
  },
  {
    type: 'expense',
    description: 'Uber para o trabalho',
    category: 'transporte',
    day: 13,
    amountsCents: [2790, 3450, 2980],
  },
  {
    type: 'expense',
    description: 'Farmácia',
    category: 'saúde',
    day: 14,
    amountsCents: [6789, 0, 12450],
  },
  {
    type: 'expense',
    description: 'Supermercado',
    category: 'mercado',
    day: 17,
    amountsCents: [42310, 39875, 44120],
  },
  {
    type: 'income',
    description: 'Freelance landing page',
    category: 'freelance',
    day: 18,
    amountsCents: [0, 180000, 0],
  },
  {
    type: 'expense',
    description: 'Jantar fora',
    category: 'restaurante',
    day: 21,
    amountsCents: [16540, 21890, 13275],
  },
  {
    type: 'expense',
    description: 'Combustível',
    category: 'transporte',
    day: 23,
    amountsCents: [25000, 22000, 24500],
  },
  {
    type: 'expense',
    description: 'Almoço no trabalho',
    category: 'restaurante',
    day: 26,
    amountsCents: [8970, 10240, 9430],
  },
]

// "lazer" fica apertado de propósito: o show do mês de referência estoura o teto
// e a demo mostra o alerta de orçamento acima de 100%.
const BUDGETS: readonly DemoBudget[] = [
  { category: 'mercado', amountCents: 120000 },
  { category: 'restaurante', amountCents: 40000 },
  { category: 'transporte', amountCents: 60000 },
  { category: 'lazer', amountCents: 15000 },
]

function isoDay(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, '0')}`
}

/**
 * Dados determinísticos (nada de `Math.random`): rodar duas vezes gera o mesmo
 * dashboard, e o teste consegue afirmar valores exatos. Tudo é relativo a
 * `today` (YYYY-MM-DD), para a demo sempre cair nos meses que o dashboard abre.
 *
 * No mês de referência, gasto variável só entra até o dia de hoje — extrato com
 * "compra de amanhã" denunciaria dado falso. As recorrentes entram inteiras
 * porque o boot geraria as mesmas de qualquer jeito.
 */
export function buildDemoData(today: string): DemoData {
  const referenceMonth = today.slice(0, 7)
  const todayDay = Number(today.slice(8, 10))
  const months = [referenceMonth]
  while (months.length < DEMO_MONTHS) {
    months.unshift(previousMonth(months[0] ?? referenceMonth))
  }

  const transactions: CreateTransactionInput[] = []
  months.forEach((month, index) => {
    const isReference = month === referenceMonth
    for (const [entries, recurring] of [
      [RECURRING, true],
      [VARIABLE, false],
    ] as const) {
      for (const entry of entries) {
        const amountCents = entry.amountsCents[index] ?? 0
        if (amountCents === 0 || (isReference && !recurring && entry.day > todayDay)) {
          continue
        }
        transactions.push({
          type: entry.type,
          description: entry.description,
          amountCents,
          category: entry.category,
          occurredOn: isoDay(month, entry.day),
          recurring,
          accountId: null,
        })
      }
    }
  })
  transactions.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))

  const nextYear = Number(today.slice(0, 4)) + 1
  const goals: CreateGoalInput[] = [
    { name: 'Reserva de emergência', targetCents: 3000000, savedCents: 1250000, deadline: null },
    {
      name: 'Viagem para o Chile',
      targetCents: 1200000,
      savedCents: 480000,
      deadline: `${nextYear}-07-01`,
    },
    {
      name: 'Notebook novo',
      targetCents: 800000,
      savedCents: 650000,
      deadline: `${nextYear}-03-15`,
    },
  ]

  return { transactions, budgets: [...BUDGETS], goals }
}

/**
 * Cria (ou recria) a conta de demonstração com os dados de `buildDemoData`.
 * Idempotente: se a conta já existe, apaga só os dados *dela* e insere de novo,
 * então rodar o seed duas vezes não duplica lançamentos nem toca em outras contas.
 * Tudo numa transação do SQLite: falhou no meio, o banco fica como estava.
 *
 * Recebe o hash pronto porque o argon2 é assíncrono e transação do better-sqlite3 não.
 */
export function seedDemo(
  db: AppDatabase,
  options: { passwordHash: string; today: string },
): SeedResult {
  const data = buildDemoData(options.today)
  const transactions = new TransactionsRepository(db)
  const budgets = new BudgetsRepository(db)
  const goals = new GoalsRepository(db)

  const run = db.transaction((): SeedResult => {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_EMAIL) as
      { id: number } | undefined
    let userId: number
    if (existing) {
      userId = existing.id
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        options.passwordHash,
        userId,
      )
      for (const table of ['transactions', 'budgets', 'goals']) {
        db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId)
      }
    } else {
      const result = db
        .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
        .run(DEMO_EMAIL, options.passwordHash)
      userId = Number(result.lastInsertRowid)
    }

    transactions.createMany(userId, data.transactions)
    for (const budget of data.budgets) {
      budgets.upsert(userId, budget.category, budget.amountCents)
    }
    for (const goal of data.goals) {
      goals.create(userId, goal)
    }
    return {
      userId,
      transactions: data.transactions.length,
      budgets: data.budgets.length,
      goals: data.goals.length,
    }
  })
  return run()
}
