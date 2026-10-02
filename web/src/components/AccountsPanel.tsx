import { useState, type FormEvent } from 'react'
import { useCreateAccount, useDeleteAccount } from '../hooks/use-finance'
import { t } from '../i18n'
import { formatBRL, parseReaisToCents, type Account } from '../lib/api'
import { Skeleton } from './Skeleton'

interface AccountsPanelProps {
  accounts: Account[] | undefined
  loading: boolean
}

export function AccountsPanel({ accounts, loading }: AccountsPanelProps) {
  const [name, setName] = useState('')
  const [openingBalance, setOpeningBalance] = useState('')
  const [error, setError] = useState<string | null>(null)
  const createAccount = useCreateAccount()
  const deleteAccount = useDeleteAccount()
  const items = accounts ?? []

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    // Saldo inicial pode ficar em branco (zero) ou ser negativo (cartão já devendo).
    let openingBalanceCents = 0
    if (openingBalance.trim()) {
      try {
        openingBalanceCents = parseReaisToCents(openingBalance.trim())
      } catch {
        setError(t.accounts.invalidOpeningBalance)
        return
      }
    }

    createAccount.mutate(
      { name: name.trim(), openingBalanceCents },
      {
        onSuccess: () => {
          setName('')
          setOpeningBalance('')
        },
        // 409 é o nome repetido: mensagem legível em vez do `API 409` cru.
        onError: (mutationError) =>
          setError(
            mutationError.message.startsWith('API 409')
              ? t.accounts.alreadyExists
              : mutationError.message,
          ),
      },
    )
  }

  return (
    <section className="accounts-panel card" aria-busy={loading}>
      <h2>{t.accounts.title}</h2>
      {loading ? (
        <Skeleton lines={2} label={t.accounts.loading} />
      ) : items.length === 0 ? (
        <p className="list-empty">{t.accounts.empty}</p>
      ) : (
        <ul className="account-list">
          {items.map((account) => (
            <li key={account.id} className="account-item">
              <span className="account-name">{account.name}</span>
              <span className={`account-balance ${account.balanceCents < 0 ? 'negative' : ''}`}>
                {formatBRL(account.balanceCents)}
              </span>
              <button
                type="button"
                className="delete-button"
                aria-label={t.accounts.removeLabel(account.name)}
                onClick={() => deleteAccount.mutate(account.id)}
                disabled={deleteAccount.isPending}
              >
                {t.common.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="account-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            {t.accounts.name}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.accounts.namePlaceholder}
              required
              maxLength={50}
            />
          </label>
          <label>
            {t.accounts.openingBalance}
            <input
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder={t.accounts.openingBalancePlaceholder}
              inputMode="decimal"
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={createAccount.isPending}>
          {createAccount.isPending ? t.common.saving : t.accounts.submit}
        </button>
      </form>
    </section>
  )
}
