import { formatBRL, type Transaction } from '../lib/api'

interface TransactionListProps {
  transactions: Transaction[] | undefined
  loading: boolean
}

export function TransactionList({ transactions, loading }: TransactionListProps) {
  if (loading) {
    return <p className="list-empty">Carregando…</p>
  }
  if (!transactions || transactions.length === 0) {
    return <p className="list-empty">Nenhuma transação neste mês.</p>
  }

  return (
    <div className="table-wrapper">
      <table className="transaction-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th className="amount-col">Valor</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td>{transaction.occurredOn.split('-').reverse().join('/')}</td>
              <td>{transaction.description}</td>
              <td>
                <span className="category-tag">{transaction.category}</span>
              </td>
              <td className={`amount-col ${transaction.type}`}>
                {transaction.type === 'expense' ? '−' : '+'}
                {formatBRL(transaction.amountCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
