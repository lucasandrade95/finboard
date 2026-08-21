import { useState } from 'react'
import { SummaryCards } from './components/SummaryCards'
import { TransactionForm } from './components/TransactionForm'
import { TransactionList } from './components/TransactionList'
import { useSummary, useTransactions } from './hooks/use-finance'

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

export function App() {
  const [month, setMonth] = useState(currentMonth)
  const transactions = useTransactions(month)
  const summary = useSummary(month)

  return (
    <div className="layout">
      <header className="topbar">
        <h1>Finboard</h1>
        <label className="month-picker">
          Mês
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </header>

      <main>
        <SummaryCards summary={summary.data} loading={summary.isPending} />
        {(transactions.isError || summary.isError) && (
          <p className="form-error">Falha ao carregar dados. A API está rodando?</p>
        )}
        <TransactionForm />
        <TransactionList transactions={transactions.data} loading={transactions.isPending} />
      </main>
    </div>
  )
}
