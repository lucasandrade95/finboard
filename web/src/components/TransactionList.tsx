import { formatBRL, type Transaction } from '../lib/api'
import { useDeleteTransaction } from '../hooks/use-finance'

interface TransactionListProps {
  transactions: Transaction[] | undefined
  loading: boolean
}

export function TransactionList({ transactions, loading }: TransactionListProps) {
  const deleteTransaction = useDeleteTransaction()

  if (loading) {
    return <p className="list-empty">Carregando…</p>
  }
  if (!transactions || transactions.length === 0) {
    return <p className="list-empty">Nenhuma transação neste mês.</p>
  }

  function handleDelete(transaction: Transaction) {
    if (window.confirm(`Excluir "${transaction.description}"?`)) {
      deleteTransaction.mutate(transaction.id)
    }
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
            <th className="actions-col">
              <span className="visually-hidden">Ações</span>
            </th>
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
              <td className="actions-col">
                <button
                  type="button"
                  className="delete-button"
                  aria-label={`Excluir ${transaction.description}`}
                  disabled={deleteTransaction.isPending}
                  onClick={() => handleDelete(transaction)}
                >
                  Excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {deleteTransaction.isError && <p className="form-error">Falha ao excluir. Tente de novo.</p>}
    </div>
  )
}
