import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import argon2 from 'argon2'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { openDatabase, type AppDatabase } from '../src/db/connection.js'
import { buildDemoData, DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from '../src/db/seed.js'

const TODAY = '2026-09-27'

describe('buildDemoData', () => {
  it('cobre três meses terminando no mês de referência, virando o ano quando preciso', () => {
    const months = (today: string) =>
      [...new Set(buildDemoData(today).transactions.map((t) => t.occurredOn.slice(0, 7)))].sort()

    expect(months(TODAY)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(months('2027-01-20')).toEqual(['2026-11', '2026-12', '2027-01'])
  })

  it('é determinístico e só usa valores inteiros e positivos em centavos', () => {
    const first = buildDemoData(TODAY)
    expect(buildDemoData(TODAY)).toEqual(first)
    for (const transaction of first.transactions) {
      expect(Number.isInteger(transaction.amountCents)).toBe(true)
      expect(transaction.amountCents).toBeGreaterThan(0)
    }
  })

  it('não inventa gasto variável depois de hoje, mas mantém as recorrentes do mês', () => {
    const { transactions } = buildDemoData('2026-09-10')
    const september = transactions.filter((t) => t.occurredOn.startsWith('2026-09'))

    const futureVariable = september.filter((t) => !t.recurring && t.occurredOn > '2026-09-10')
    expect(futureVariable).toEqual([])
    expect(september.filter((t) => t.recurring).map((t) => t.description)).toEqual([
      'Salário',
      'Academia',
      'Aluguel',
      'Internet fibra',
      'Streaming',
    ])
  })

  it('devolve as transações em ordem cronológica', () => {
    const dates = buildDemoData(TODAY).transactions.map((t) => t.occurredOn)
    expect(dates).toEqual([...dates].sort())
  })
})

describe('seedDemo', () => {
  let dir: string
  let dbPath: string
  let db: AppDatabase

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finboard-seed-'))
    dbPath = join(dir, 'demo.db')
    db = openDatabase(dbPath)
  })

  afterEach(() => {
    if (db.open) db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const countFor = (table: string, userId: number) =>
    (
      db.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE user_id = ?`).get(userId) as {
        total: number
      }
    ).total

  it('cria a conta demo com transações, orçamentos e metas', () => {
    const result = seedDemo(db, { passwordHash: 'hash', today: TODAY })

    expect(result.transactions).toBe(buildDemoData(TODAY).transactions.length)
    expect(countFor('transactions', result.userId)).toBe(result.transactions)
    expect(countFor('budgets', result.userId)).toBe(4)
    expect(countFor('goals', result.userId)).toBe(3)
  })

  it('rodar de novo recria só os dados da demo, sem duplicar nem tocar em outra conta', () => {
    const other = db
      .prepare("INSERT INTO users (email, password_hash) VALUES ('lucas@example.com', 'x')")
      .run()
    const otherId = Number(other.lastInsertRowid)
    db.prepare(
      `INSERT INTO transactions (user_id, type, description, amount_cents, category, occurred_on)
       VALUES (?, 'expense', 'Café', 800, 'mercado', '2026-09-01')`,
    ).run(otherId)

    const first = seedDemo(db, { passwordHash: 'hash-1', today: TODAY })
    const second = seedDemo(db, { passwordHash: 'hash-2', today: TODAY })

    expect(second.userId).toBe(first.userId)
    expect(countFor('transactions', first.userId)).toBe(first.transactions)
    expect(countFor('goals', first.userId)).toBe(3)
    expect(countFor('transactions', otherId)).toBe(1)
    const { password_hash } = db
      .prepare('SELECT password_hash FROM users WHERE email = ?')
      .get(DEMO_EMAIL) as { password_hash: string }
    expect(password_hash).toBe('hash-2')
  })

  it('deixa o dashboard pronto: login da demo, resumo do mês e orçamento estourado', async () => {
    seedDemo(db, { passwordHash: await argon2.hash(DEMO_PASSWORD), today: TODAY })
    db.close()

    const app = await buildApp({ dbPath, recurringMonth: '2026-09', rateLimit: false })
    try {
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      })
      expect(login.statusCode).toBe(200)
      const headers = { authorization: `Bearer ${login.json().token}` }

      // O boot não gera recorrentes repetidas: o seed já trouxe as do mês.
      const summary = await app.inject({
        method: 'GET',
        url: '/api/summary?month=2026-09',
        headers,
      })
      expect(summary.json()).toMatchObject({
        incomeCents: 850000,
        expenseCents: 433307,
        balanceCents: 416693,
        previous: { month: '2026-08', incomeCents: 1030000 },
      })

      const budgets = await app.inject({
        method: 'GET',
        url: '/api/budgets?month=2026-09',
        headers,
      })
      const lazer = budgets
        .json()
        .items.find((item: { category: string }) => item.category === 'lazer')
      expect(lazer).toEqual({ category: 'lazer', budgetCents: 15000, spentCents: 23590 })

      const goals = await app.inject({ method: 'GET', url: '/api/goals', headers })
      expect(goals.json().items).toHaveLength(3)
    } finally {
      await app.close()
    }
  })
})
