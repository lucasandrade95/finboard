import argon2 from 'argon2'
import { loadConfig } from './config.js'
import { openDatabase } from './db/connection.js'
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from './db/seed.js'

// A senha da demo é pública: em produção o seed só roda pedido explicitamente,
// para ninguém criar sem querer uma conta com senha conhecida num banco real.
if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Seed recusado em produção: rode com --force se for mesmo um ambiente de demo.')
  process.exit(1)
}

// Data local, não UTC: segue o mesmo relógio que o boot usa para o mês atual.
function localToday(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const config = loadConfig()
const db = openDatabase(config.dbPath)
try {
  const result = seedDemo(db, {
    passwordHash: await argon2.hash(DEMO_PASSWORD),
    today: localToday(),
  })
  console.log(
    `Demo pronta em ${config.dbPath}: ${result.transactions} transações, ` +
      `${result.budgets} orçamentos, ${result.goals} metas.`,
  )
  console.log(`Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)
} finally {
  db.close()
}
