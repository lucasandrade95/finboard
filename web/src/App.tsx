import { useEffect, useState } from 'react'
import { CategoryFilter } from './components/CategoryFilter'
import { SummaryCards } from './components/SummaryCards'
import { TransactionForm } from './components/TransactionForm'
import { TransactionList } from './components/TransactionList'
import { useSummary, useTransactions } from './hooks/use-finance'
import { PAGE_SIZE } from './lib/api'

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

export function App() {
  const [month, setMonth] = useState(currentMonth)
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState('')
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  const transactions = useTransactions(month, page, category || undefined)
  const summary = useSummary(month)

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

  // Opções do filtro vêm da listagem sem filtro; congela enquanto um filtro está ativo
  // para o select não colapsar na categoria escolhida. (Endpoint /api/categories no roadmap.)
  const items = transactions.data?.items
  useEffect(() => {
    if (category === '' && items) {
      setCategoryOptions(
        [...new Set(items.map((t) => t.category))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      )
    }
  }, [category, items])

  function handleMonthChange(value: string) {
    setMonth(value)
    setPage(1)
  }

  function handleCategoryChange(value: string) {
    setCategory(value)
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
      </header>

      <main>
        <SummaryCards summary={summary.data} loading={summary.isPending} />
        {(transactions.isError || summary.isError) && (
          <p className="form-error">Falha ao carregar dados. A API está rodando?</p>
        )}
        <TransactionForm />
        <div className="list-toolbar">
          <CategoryFilter
            value={category}
            options={categoryOptions}
            onChange={handleCategoryChange}
          />
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
