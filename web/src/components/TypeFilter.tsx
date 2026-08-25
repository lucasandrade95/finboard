import type { TransactionType } from '../lib/api'

interface TypeFilterProps {
  value: TransactionType | ''
  onChange: (type: TransactionType | '') => void
}

const OPTIONS: Array<{ value: TransactionType; label: string }> = [
  { value: 'income', label: 'Receitas' },
  { value: 'expense', label: 'Despesas' },
]

export function TypeFilter({ value, onChange }: TypeFilterProps) {
  return (
    <label className="type-filter">
      Tipo
      <select value={value} onChange={(e) => onChange(e.target.value as TransactionType | '')}>
        <option value="">Todos</option>
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
