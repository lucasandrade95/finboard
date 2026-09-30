import { t } from '../i18n'
import type { TransactionType } from '../lib/api'

interface TypeFilterProps {
  value: TransactionType | ''
  onChange: (type: TransactionType | '') => void
}

const OPTIONS: Array<{ value: TransactionType; label: string }> = [
  { value: 'income', label: t.filters.incomes },
  { value: 'expense', label: t.filters.expenses },
]

export function TypeFilter({ value, onChange }: TypeFilterProps) {
  return (
    <label className="type-filter">
      {t.common.type}
      <select value={value} onChange={(e) => onChange(e.target.value as TransactionType | '')}>
        <option value="">{t.filters.allTypes}</option>
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
