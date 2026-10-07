import { useState, type FormEvent } from 'react'
import { useCreateInstallment, useDeleteInstallment } from '../hooks/use-finance'
import { t } from '../i18n'
import { formatBRL, parseReaisToCents, type Account, type Installment } from '../lib/api'
import { Skeleton } from './Skeleton'

const MAX_INSTALLMENTS = 48

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(isoDate: string): string {
  return isoDate.split('-').reverse().join('/')
}

interface InstallmentsPanelProps {
  installments: Installment[] | undefined
  accounts: Account[] | undefined
  loading: boolean
}

export function InstallmentsPanel({ installments, accounts, loading }: InstallmentsPanelProps) {
  const accountList = accounts ?? []
  const [description, setDescription] = useState('')
  const [total, setTotal] = useState('')
  const [count, setCount] = useState('2')
  const [firstDueOn, setFirstDueOn] = useState(today)
  const [category, setCategory] = useState('')
  // Texto do select: o id vira número só no envio; vazio é "sem conta".
  const [accountId, setAccountId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const createInstallment = useCreateInstallment()
  const deleteInstallment = useDeleteInstallment()
  const items = installments ?? []

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const installmentCount = Number(count)
    if (
      !Number.isInteger(installmentCount) ||
      installmentCount < 2 ||
      installmentCount > MAX_INSTALLMENTS
    ) {
      setError(t.installments.invalidCount)
      return
    }
    let totalCents: number
    try {
      totalCents = parseReaisToCents(total)
    } catch {
      setError(t.common.invalidAmount('3.500,00'))
      return
    }
    if (totalCents <= 0) {
      setError(t.common.amountMustBePositive)
      return
    }
    // Cada parcela precisa de ao menos 1 centavo: o server recusaria com 400.
    if (totalCents < installmentCount) {
      setError(t.installments.tooSmall)
      return
    }

    createInstallment.mutate(
      {
        description: description.trim(),
        totalCents,
        installmentCount,
        firstDueOn,
        // Em branco, o server usa a categoria "geral".
        ...(category.trim() ? { category: category.trim() } : {}),
        ...(accountId ? { accountId: Number(accountId) } : {}),
      },
      {
        onSuccess: () => {
          setDescription('')
          setTotal('')
          setCount('2')
        },
        onError: (mutationError) => setError(mutationError.message),
      },
    )
  }

  function handleRemove(installment: Installment) {
    if (window.confirm(t.installments.confirmRemove(installment.description))) {
      deleteInstallment.mutate(installment.id)
    }
  }

  return (
    <section className="installments-panel card" aria-busy={loading}>
      <h2>{t.installments.title}</h2>
      {loading ? (
        <Skeleton lines={2} label={t.installments.loading} />
      ) : (
        <>
          {items.length === 0 ? (
            <p className="list-empty">{t.installments.empty}</p>
          ) : (
            <ul className="transfer-list">
              {items.map((installment) => (
                <li key={installment.id} className="transfer-item">
                  <span className="transfer-date">
                    {t.installments.period(
                      formatDate(installment.firstDueOn),
                      formatDate(installment.lastDueOn),
                    )}
                  </span>
                  <span>
                    {installment.description}
                    {' · '}
                    {installment.category}
                  </span>
                  <span className="transfer-amount">
                    {t.installments.preview(
                      installment.installmentCount,
                      formatBRL(installment.totalCents),
                    )}
                  </span>
                  <button
                    type="button"
                    className="delete-button"
                    aria-label={t.installments.removeLabel(installment.description)}
                    onClick={() => handleRemove(installment)}
                    disabled={deleteInstallment.isPending}
                  >
                    {t.installments.remove}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="transfer-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                {t.installments.description}
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t.installments.descriptionPlaceholder}
                  maxLength={190}
                  required
                />
              </label>
              <label>
                {t.installments.total}
                <input
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                  required
                />
              </label>
              <label>
                {t.installments.count}
                <input
                  type="number"
                  min={2}
                  max={MAX_INSTALLMENTS}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  required
                />
              </label>
              <label>
                {t.installments.firstDueOn}
                <input
                  type="date"
                  value={firstDueOn}
                  onChange={(e) => setFirstDueOn(e.target.value)}
                  required
                />
              </label>
              <label>
                {t.common.category}
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder={t.common.categoryPlaceholder}
                  maxLength={50}
                />
              </label>
              {accountList.length > 0 && (
                <label>
                  {t.accounts.field}
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">{t.accounts.noAccount}</option>
                    {accountList.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={createInstallment.isPending}>
              {createInstallment.isPending ? t.common.saving : t.installments.submit}
            </button>
          </form>
        </>
      )}
    </section>
  )
}
