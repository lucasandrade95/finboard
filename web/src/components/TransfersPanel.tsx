import { useState, type FormEvent } from 'react'
import { useCreateTransfer, useDeleteTransfer } from '../hooks/use-finance'
import { t } from '../i18n'
import { formatBRL, parseReaisToCents, type Account, type Transfer } from '../lib/api'
import { Skeleton } from './Skeleton'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(isoDate: string): string {
  return isoDate.split('-').reverse().join('/')
}

interface TransfersPanelProps {
  transfers: Transfer[] | undefined
  accounts: Account[] | undefined
  loading: boolean
}

export function TransfersPanel({ transfers, accounts, loading }: TransfersPanelProps) {
  const accountList = accounts ?? []
  // Texto dos selects: o id vira número só no envio.
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [occurredOn, setOccurredOn] = useState(today)
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const createTransfer = useCreateTransfer()
  const deleteTransfer = useDeleteTransfer()
  const items = transfers ?? []

  // Sem escolha explícita, origem é a primeira conta e destino a segunda.
  const from = fromAccountId || String(accountList[0]?.id ?? '')
  const to = toAccountId || String(accountList[1]?.id ?? '')
  const nameOf = (id: number | null) =>
    accountList.find((account) => account.id === id)?.name ?? t.transfers.removedAccount

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (from === to) {
      setError(t.transfers.sameAccount)
      return
    }
    let amountCents: number
    try {
      amountCents = parseReaisToCents(amount)
    } catch {
      setError(t.common.invalidAmount('500,00'))
      return
    }
    if (amountCents <= 0) {
      setError(t.common.amountMustBePositive)
      return
    }

    createTransfer.mutate(
      {
        fromAccountId: Number(from),
        toAccountId: Number(to),
        amountCents,
        occurredOn,
        // Em branco, o server usa "Transferência".
        ...(description.trim() ? { description: description.trim() } : {}),
      },
      {
        onSuccess: () => {
          setAmount('')
          setDescription('')
        },
        onError: (mutationError) => setError(mutationError.message),
      },
    )
  }

  return (
    <section className="transfers-panel card" aria-busy={loading}>
      <h2>{t.transfers.title}</h2>
      {loading ? (
        <Skeleton lines={2} label={t.transfers.loading} />
      ) : accountList.length < 2 ? (
        <p className="list-empty">{t.transfers.needTwoAccounts}</p>
      ) : (
        <>
          {items.length === 0 ? (
            <p className="list-empty">{t.transfers.empty}</p>
          ) : (
            <ul className="transfer-list">
              {items.map((transfer) => (
                <li key={transfer.id} className="transfer-item">
                  <span className="transfer-date">{formatDate(transfer.occurredOn)}</span>
                  <span>
                    {transfer.description}
                    {' · '}
                    {t.transfers.route(
                      nameOf(transfer.fromAccountId),
                      nameOf(transfer.toAccountId),
                    )}
                  </span>
                  <span className="transfer-amount">{formatBRL(transfer.amountCents)}</span>
                  <button
                    type="button"
                    className="delete-button"
                    aria-label={t.transfers.removeLabel(
                      transfer.description,
                      formatDate(transfer.occurredOn),
                    )}
                    onClick={() => deleteTransfer.mutate(transfer.id)}
                    disabled={deleteTransfer.isPending}
                  >
                    {t.transfers.remove}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="transfer-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                {t.transfers.from}
                <select value={from} onChange={(e) => setFromAccountId(e.target.value)}>
                  {accountList.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.transfers.to}
                <select value={to} onChange={(e) => setToAccountId(e.target.value)}>
                  {accountList.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.transfers.amount}
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                  required
                />
              </label>
              <label>
                {t.transfers.date}
                <input
                  type="date"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  required
                />
              </label>
              <label>
                {t.transfers.description}
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t.transfers.descriptionPlaceholder}
                  maxLength={200}
                />
              </label>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={createTransfer.isPending}>
              {createTransfer.isPending ? t.common.saving : t.transfers.submit}
            </button>
          </form>
        </>
      )}
    </section>
  )
}
