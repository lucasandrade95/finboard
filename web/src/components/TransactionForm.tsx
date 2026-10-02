import { useState, type FormEvent } from 'react'
import { useCreateTransaction } from '../hooks/use-finance'
import { t } from '../i18n'
import { parseReaisToCents, type Account, type Category, type TransactionType } from '../lib/api'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface TransactionFormProps {
  /** Nomes já usados no mês: sugestões do campo livre quando não há catálogo. */
  categories?: string[]
  /** Catálogo da conta: com pelo menos uma categoria cadastrada, o campo vira select. */
  catalog?: Category[]
  /** Contas do usuário: com pelo menos uma cadastrada, aparece o select de conta. */
  accounts?: Account[]
}

export function TransactionForm({
  categories = [],
  catalog = [],
  accounts = [],
}: TransactionFormProps) {
  const [type, setType] = useState<TransactionType>('expense')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [occurredOn, setOccurredOn] = useState(today)
  const [recurring, setRecurring] = useState(false)
  // Texto do select: '' é "sem conta"; o id vira número só no envio.
  const [accountId, setAccountId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const createTransaction = useCreateTransaction()

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

    createTransaction.mutate(
      {
        type,
        description: description.trim(),
        amountCents,
        category: category.trim() || undefined,
        occurredOn,
        recurring,
        // Sem contas cadastradas o campo nem existe: o corpo segue igual ao de antes.
        ...(accounts.length > 0 ? { accountId: accountId ? Number(accountId) : null } : {}),
      },
      {
        onSuccess: () => {
          setDescription('')
          setAmount('')
          setCategory('')
          setRecurring(false)
        },
        onError: (mutationError) => setError(mutationError.message),
      },
    )
  }

  return (
    <form className="transaction-form" onSubmit={handleSubmit}>
      <h2>{t.transactionForm.title}</h2>
      <div className="form-grid">
        <label>
          {t.common.type}
          <select value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
            <option value="expense">{t.common.expense}</option>
            <option value="income">{t.common.income}</option>
          </select>
        </label>
        <label>
          {t.common.description}
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.transactionForm.descriptionPlaceholder}
            required
            maxLength={200}
          />
        </label>
        <label>
          {t.common.amountInput}
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="159,90"
            required
            inputMode="decimal"
          />
        </label>
        <label>
          {t.common.category}
          {catalog.length > 0 ? (
            // Valor vazio cai no default `geral` do server, igual ao campo livre em branco.
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{t.transactionForm.defaultCategory}</option>
              {catalog.map((option) => (
                <option key={option.id} value={option.name}>
                  {option.icon ? `${option.icon} ${option.name}` : option.name}
                </option>
              ))}
            </select>
          ) : (
            <>
              {/* datalist sugere as categorias já usadas sem impedir digitar uma nova. */}
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t.common.categoryPlaceholder}
                maxLength={50}
                list="category-suggestions"
              />
              <datalist id="category-suggestions">
                {categories.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </>
          )}
        </label>
        <label>
          {t.common.date}
          <input
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            required
          />
        </label>
        {accounts.length > 0 && (
          <label>
            {t.accounts.field}
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">{t.accounts.noAccount}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
          />
          {t.common.recurringLabel}
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={createTransaction.isPending}>
        {createTransaction.isPending ? t.common.saving : t.transactionForm.submit}
      </button>
    </form>
  )
}
