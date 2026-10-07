import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { t } from '../i18n'
import {
  formatBRL,
  parseReaisToCents,
  PAGE_SIZE,
  type Transaction,
  type TransactionType,
} from '../lib/api'
import { formatTagsInput, parseTagsInput, tagsWithinLimits } from '../lib/tags'
import { useDeleteTransaction, useUpdateTransaction } from '../hooks/use-finance'
import { Skeleton } from './Skeleton'

interface TransactionListProps {
  transactions: Transaction[] | undefined
  loading: boolean
  page?: number
  total?: number
  onPageChange?: (page: number) => void
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
  const [recurring, setRecurring] = useState(transaction.recurring)
  const [tagsText, setTagsText] = useState(formatTagsInput(transaction.tags))
  const [error, setError] = useState<string | null>(null)
  const updateTransaction = useUpdateTransaction()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    let amountCents: number
    try {
      amountCents = parseReaisToCents(amount)
    } catch {
      setError(t.common.invalidAmount('159,90'))
      return
    }
    if (amountCents <= 0) {
      setError(t.common.amountMustBePositive)
      return
    }
    const tags = parseTagsInput(tagsText)
    if (!tagsWithinLimits(tags)) {
      setError(t.tags.invalid)
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
          recurring,
          // Sempre enviadas: o campo vem preenchido, então apagá-lo é remover as tags.
          tags,
        },
      },
      {
        onSuccess: onDone,
        onError: (mutationError) => setError(mutationError.message),
      },
    )
  }

  // Escape cancela de qualquer campo da linha, como num diálogo.
  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onDone()
    }
  }

  const formId = `edit-transaction-${transaction.id}`

  return (
    <tr className="edit-row" onKeyDown={handleKeyDown}>
      <td>
        <input
          form={formId}
          type="date"
          aria-label={t.common.date}
          // Quem abriu a edição pelo teclado cai direto no primeiro campo.
          autoFocus
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          required
        />
      </td>
      <td>
        <form id={formId} onSubmit={handleSubmit}>
          <input
            aria-label={t.common.description}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            maxLength={200}
          />
        </form>
        <input
          form={formId}
          className="edit-tags"
          aria-label={t.tags.field}
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder={t.tags.placeholder}
        />
        <label className="checkbox-label">
          <input
            form={formId}
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
          />
          {t.common.recurringLabel}
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </td>
      <td>
        <input
          form={formId}
          aria-label={t.common.category}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder={t.common.categoryPlaceholder}
          maxLength={50}
        />
      </td>
      <td className="amount-col">
        <span className="edit-amount">
          <select
            form={formId}
            aria-label={t.common.type}
            value={type}
            onChange={(e) => setType(e.target.value as TransactionType)}
          >
            <option value="expense">{t.common.expense}</option>
            <option value="income">{t.common.income}</option>
          </select>
          <input
            form={formId}
            aria-label={t.common.amountInput}
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
          {updateTransaction.isPending ? t.common.saving : t.transactionList.save}
        </button>
        <button type="button" className="edit-button" onClick={onDone}>
          {t.transactionList.cancel}
        </button>
      </td>
    </tr>
  )
}

export function TransactionList({
  transactions,
  loading,
  page = 1,
  total = 0,
  onPageChange,
}: TransactionListProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const deleteTransaction = useDeleteTransaction()
  const editButtons = useRef(new Map<number, HTMLButtonElement>())
  const closedEditId = useRef<number | null>(null)

  // Ao fechar a edição (salvar, cancelar ou Escape) a linha é desmontada junto
  // com o foco; devolvê-lo ao "Editar" da mesma linha evita cair no topo da página.
  useEffect(() => {
    if (editingId === null && closedEditId.current !== null) {
      editButtons.current.get(closedEditId.current)?.focus()
      closedEditId.current = null
    }
  }, [editingId])
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (loading) {
    // Seis barras: sugere uma lista sem apostar no tamanho da página, que varia com o filtro.
    return <Skeleton lines={6} label={t.transactionList.loading} />
  }
  if (!transactions || transactions.length === 0) {
    return <p className="list-empty">{t.transactionList.empty}</p>
  }

  function handleDelete(transaction: Transaction) {
    if (window.confirm(t.transactionList.confirmDelete(transaction.description))) {
      deleteTransaction.mutate(transaction.id)
    }
  }

  return (
    <div className="table-wrapper">
      <table className="transaction-table">
        <thead>
          <tr>
            <th>{t.common.date}</th>
            <th>{t.common.description}</th>
            <th>{t.common.category}</th>
            <th className="amount-col">{t.common.amount}</th>
            <th className="actions-col">
              <span className="visually-hidden">{t.transactionList.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) =>
            transaction.id === editingId ? (
              <TransactionEditRow
                key={transaction.id}
                transaction={transaction}
                onDone={() => {
                  closedEditId.current = transaction.id
                  setEditingId(null)
                }}
              />
            ) : (
              <tr key={transaction.id}>
                <td>{transaction.occurredOn.split('-').reverse().join('/')}</td>
                <td>
                  {transaction.description}
                  {transaction.recurring && (
                    <span className="recurring-tag" title={t.transactionList.recurringTitle}>
                      {t.transactionList.recurringTag}
                    </span>
                  )}
                  {transaction.tags.length > 0 && (
                    <ul className="tag-list" aria-label={t.tags.field}>
                      {transaction.tags.map((tag) => (
                        <li key={tag} className="tag-chip">
                          #{tag}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>
                  <span className="category-tag">{transaction.category}</span>
                  {transaction.transferId !== null && (
                    <span className="transfer-tag">{t.transactionList.transferTag}</span>
                  )}
                  {transaction.installmentId !== null && (
                    <span className="transfer-tag">{t.transactionList.installmentTag}</span>
                  )}
                </td>
                <td className={`amount-col ${transaction.type}`}>
                  {transaction.type === 'expense' ? '−' : '+'}
                  {formatBRL(transaction.amountCents)}
                </td>
                <td className="actions-col">
                  {transaction.transferId !== null ? (
                    // Editar uma perna sozinha desequilibraria as contas: a API responde 409.
                    <span className="transfer-hint">{t.transactionList.transferHint}</span>
                  ) : transaction.installmentId !== null ? (
                    // Mexer numa parcela sozinha descasaria a soma do total: a API responde 409.
                    <span className="transfer-hint">{t.transactionList.installmentHint}</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="edit-button"
                        aria-label={t.transactionList.editLabel(transaction.description)}
                        ref={(button) => {
                          if (button) {
                            editButtons.current.set(transaction.id, button)
                          } else {
                            editButtons.current.delete(transaction.id)
                          }
                        }}
                        onClick={() => setEditingId(transaction.id)}
                      >
                        {t.transactionList.edit}
                      </button>
                      <button
                        type="button"
                        className="delete-button"
                        aria-label={t.transactionList.deleteLabel(transaction.description)}
                        disabled={deleteTransaction.isPending}
                        onClick={() => handleDelete(transaction)}
                      >
                        {t.transactionList.delete}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {deleteTransaction.isError && (
        <p className="form-error" role="alert">
          {t.transactionList.deleteError}
        </p>
      )}
      {onPageChange && pageCount > 1 && (
        <nav className="pagination" aria-label={t.transactionList.pagination}>
          <button
            type="button"
            className="edit-button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            {t.transactionList.previous}
          </button>
          <span className="pagination-info" aria-live="polite">
            {t.transactionList.pageOf(page, pageCount)}
          </span>
          <button
            type="button"
            className="edit-button"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            {t.transactionList.next}
          </button>
        </nav>
      )}
    </div>
  )
}
