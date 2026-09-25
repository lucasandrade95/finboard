import { expect, test, type Page } from '@playwright/test'

// Uma conta nova por teste: o banco é compartilhado entre os testes da execução,
// e o escopo por usuário garante que um não enxerga os lançamentos do outro.
async function registerFreshUser(page: Page) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@finboard.test`
  await page.goto('/')
  await page.getByRole('button', { name: 'Não tem conta? Criar uma' }).click()
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Nova transação' })).toBeVisible()
}

async function addTransaction(
  page: Page,
  input: { type: 'Receita' | 'Despesa'; description: string; amount: string; category: string },
) {
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'Nova transação' }) })
  await form.getByLabel('Tipo').selectOption({ label: input.type })
  await form.getByLabel('Descrição').fill(input.description)
  await form.getByLabel('Valor (R$)').fill(input.amount)
  await form.getByLabel('Categoria').fill(input.category)
  await form.getByRole('button', { name: 'Adicionar' }).click()
  // O formulário limpa a descrição só depois que a API confirma o lançamento.
  await expect(form.getByLabel('Descrição')).toHaveValue('')
}

function summaryCard(page: Page, label: string) {
  return page.getByRole('article').filter({ has: page.getByRole('heading', { name: label }) })
}

test('criar transações atualiza a lista e o resumo do mês', async ({ page }) => {
  await registerFreshUser(page)

  // Conta nova: nada lançado, resumo zerado.
  await expect(summaryCard(page, 'Saldo')).toContainText(/R\$\s0,00/)

  await addTransaction(page, {
    type: 'Receita',
    description: 'Salário',
    amount: '5.000,00',
    category: 'trabalho',
  })
  await addTransaction(page, {
    type: 'Despesa',
    description: 'Mercado',
    amount: '350,75',
    category: 'alimentação',
  })

  const rows = page.locator('table.transaction-table tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(rows.filter({ hasText: 'Salário' })).toContainText(/\+\s*R\$\s5\.000,00/)
  await expect(rows.filter({ hasText: 'Mercado' })).toContainText(/−\s*R\$\s350,75/)

  // O resumo é recalculado pela API (invalidação do TanStack Query), não somado no front.
  await expect(summaryCard(page, 'Receitas')).toContainText(/R\$\s5\.000,00/)
  await expect(summaryCard(page, 'Despesas')).toContainText(/R\$\s350,75/)
  await expect(summaryCard(page, 'Saldo')).toContainText(/R\$\s4\.649,25/)
})

test('os lançamentos continuam lá depois de recarregar a página', async ({ page }) => {
  await registerFreshUser(page)
  await addTransaction(page, {
    type: 'Despesa',
    description: 'Academia',
    amount: '99,90',
    category: 'saúde',
  })

  // Recarregar prova que o dado veio do banco (e que a sessão sobrevive ao reload).
  await page.reload()

  await expect(page.locator('table.transaction-table tbody tr')).toHaveCount(1)
  await expect(page.getByRole('cell', { name: 'Academia', exact: true })).toBeVisible()
  await expect(summaryCard(page, 'Despesas')).toContainText(/R\$\s99,90/)
  await expect(summaryCard(page, 'Saldo')).toContainText(/-R\$\s99,90/)
})
