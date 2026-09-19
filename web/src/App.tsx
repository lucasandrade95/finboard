import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { AuthScreen } from './components/AuthScreen'
import { BalanceLineChart } from './components/BalanceLineChart'
import { BudgetPanel } from './components/BudgetPanel'
import { CategoryDonut } from './components/CategoryDonut'
import { CategoryFilter } from './components/CategoryFilter'
import { ExportCsvButton } from './components/ExportCsvButton'
import { GoalsPanel } from './components/GoalsPanel'
import { ImportCsvButton } from './components/ImportCsvButton'
import { SearchFilter } from './components/SearchFilter'
import { SummaryCards } from './components/SummaryCards'
import { ThemeToggle } from './components/ThemeToggle'
import { TransactionForm } from './components/TransactionForm'
import { TransactionList } from './components/TransactionList'
import { TypeFilter } from './components/TypeFilter'
import { useToken } from './hooks/use-auth'
import { useDebouncedValue } from './hooks/use-debounced-value'
import {
  useBudgets,
  useCategories,
  useDailyBalance,
  useExpensesByCategory,
  useGoals,
  useSummary,
  useTransactions,
} from './hooks/use-finance'
import { PAGE_SIZE, type TransactionType } from './lib/api'
import { setToken } from './lib/auth'

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

/**
 * Porteiro da aplicação. O dashboard só monta com token — assim nenhuma query
 * sai antes da sessão existir e o 401 leva de volta para o login sozinho.
 */
export function App() {
  const token = useToken()
  const queryClient = useQueryClient()

  // Fim de sessão (logout ou 401 da API): o cache do usuário anterior não pode
  // reaparecer para quem entrar depois nesta mesma aba.
  useEffect(() => {
    if (!token) {
      queryClient.clear()
    }
  }, [token, queryClient])

  return token ? <Dashboard /> : <AuthScreen />
}

function Dashboard() {
  const [month, setMonth] = useState(currentMonth)
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState('')
  const [type, setType] = useState<TransactionType | ''>('')
  const [search, setSearch] = useState('')
  // Digitar não dispara requisição a cada tecla: a busca só vai para a API após a pausa.
  const searchTerm = useDebouncedValue(search.trim(), 300)
  const transactions = useTransactions(month, page, {
    type: type || undefined,
    category: category || undefined,
    q: searchTerm || undefined,
  })
  const summary = useSummary(month)
  const categories = useCategories(month)
  const expensesByCategory = useExpensesByCategory(month)
  const dailyBalance = useDailyBalance(month)
  const budgets = useBudgets(month)
  const goals = useGoals()
  const categoryOptions = categories.data ?? []

  // Excluir o último item de uma página deixa a página além do total: volta para a última válida.
  const total = transactions.data?.total
  useEffect(() => {
    if (total !== undefined) {
      const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
      if (page > pageCount) {
        setPage(pageCount)
      }
    }
  }, [total, page])

  // Um novo termo de busca muda o recorte inteiro: volta para a primeira página.
  useEffect(() => {
    setPage(1)
  }, [searchTerm])

  function handleMonthChange(value: string) {
    setMonth(value)
    setPage(1)
  }

  function handleCategoryChange(value: string) {
    setCategory(value)
    setPage(1)
  }

  function handleTypeChange(value: TransactionType | '') {
    setType(value)
    setPage(1)
  }

  return (
    <div className="layout">
      <header className="topbar">
        <h1>Finboard</h1>
        <label className="month-picker">
          Mês
          <input type="month" value={month} onChange={(e) => handleMonthChange(e.target.value)} />
        </label>
        <ThemeToggle />
        <button type="button" className="logout" onClick={() => setToken(null)}>
          Sair
        </button>
      </header>

      <main>
        <SummaryCards summary={summary.data} loading={summary.isPending} />
        {(transactions.isError || summary.isError) && (
          <p className="form-error">Falha ao carregar dados. A API está rodando?</p>
        )}
        <BalanceLineChart data={dailyBalance.data} loading={dailyBalance.isPending} />
        <CategoryDonut data={expensesByCategory.data} loading={expensesByCategory.isPending} />
        <BudgetPanel data={budgets.data} loading={budgets.isPending} categories={categoryOptions} />
        <GoalsPanel goals={goals.data} loading={goals.isPending} />
        <TransactionForm categories={categoryOptions} />
        <div className="list-toolbar">
          <SearchFilter value={search} onChange={setSearch} />
          <TypeFilter value={type} onChange={handleTypeChange} />
          <CategoryFilter
            value={category}
            options={categoryOptions}
            onChange={handleCategoryChange}
          />
          <ExportCsvButton month={month} />
          <ImportCsvButton />
        </div>
        <TransactionList
          transactions={transactions.data?.items}
          loading={transactions.isPending}
          page={page}
          total={transactions.data?.total ?? 0}
          onPageChange={setPage}
        />
      </main>
    </div>
  )
}
