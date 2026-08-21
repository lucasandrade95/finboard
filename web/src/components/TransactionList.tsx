import { useState, type FormEvent } from 'react'
import { formatBRL, parseReaisToCents, type Transaction, type TransactionType } from '../lib/api'
import { useDeleteTransaction, useUpdateTransaction } from '../hooks/use-finance'

interface TransactionListProps {
  transactions: Transaction[] | undefined
  loading: boolean
}

function centsToReaisInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

interface EditRowProps {
  transaction: Transaction
  onDone: () => void
}

function TransactionEditRow({ transaction, onDone }: EditRowProps) {
  const [type, setType] = useState<TransactionType>(transaction.type)
  const [description, setDescription] = useState(transaction.description)
  const [amount, setAmount] = useState(centsToReaisInput(transaction.amountCents))
  const [category, setCategory] = useState(transaction.category)
  const [occurredOn, setOccurredOn] = useState(transaction.occurredOn)
  const [error, setError] = useState<string | null>(null)
  const updateTransaction = useUpdateTransaction()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    let amountCents: number
    try {
      amountCents = parseReaisToCents(amount)
    } catch {
      setError('Informe um valor válido, ex.: 159,90')
      return
    }
    if (amountCents <= 0) {
      setError('O valor precisa ser maior que zero')
      return
    }

    updateTransaction.mutate(
      {
        id: transaction.id,
        input: {
          type,
          description: description.trim(),
          amountCents,
          category: category.trim() || undefined,
          occurredOn,
        },
      },
      {
        onSuccess: onDone,
        onError: (mutationError) => setError(mutationError.message),
      },
    )
  }

  const formId = `edit-transaction-${transaction.id}`

  return (
    <tr className="edit-row">
      <td>
        <input
          form={formId}
          type="date"
          aria-label="Data"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          required
        />
      </td>
      <td>
        <form id={formId} onSubmit={handleSubmit}>
          <input
            aria-label="Descrição"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            maxLength={200}
          />
        </form>
        {error && <p className="form-error">{error}</p>}
      </td>
      <td>
        <input
          form={formId}
          aria-label="Categoria"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="geral"
          maxLength={50}
        />
      </td>
      <td className="amount-col">
        <span className="edit-amount">
          <select
            form={formId}
            aria-label="Tipo"
            value={type}
            onChange={(e) => setType(e.target.value as TransactionType)}
          >
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
          <input
            form={formId}
            aria-label="Valor (R$)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            inputMode="decimal"
          />
        </span>
      </td>
      <td className="actions-col">
        <button
          form={formId}
          type="submit"
          className="save-button"
          disabled={updateTransaction.isPending}
        >
          {updateTransaction.isPending ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="edit-button" onClick={onDone}>
          Cancelar
        </button>
      </td>
    </tr>
  )
}

export function TransactionList({ transactions, loading }: TransactionListProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
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
          {transactions.map((transaction) =>
            transaction.id === editingId ? (
              <TransactionEditRow
                key={transaction.id}
                transaction={transaction}
                onDone={() => setEditingId(null)}
              />
            ) : (
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
                    className="edit-button"
                    aria-label={`Editar ${transaction.description}`}
                    onClick={() => setEditingId(transaction.id)}
                  >
                    Editar
                  </button>
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
            ),
          )}
        </tbody>
      </table>
      {deleteTransaction.isError && <p className="form-error">Falha ao excluir. Tente de novo.</p>}
    </div>
  )
}
