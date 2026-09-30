import { compareText, t } from '../i18n'

interface CategoryFilterProps {
  value: string
  options: string[]
  onChange: (category: string) => void
}

export function CategoryFilter({ value, options, onChange }: CategoryFilterProps) {
  // Mantém a categoria selecionada visível mesmo quando ela sai da lista de opções
  // (ex.: mudou o mês com o filtro ativo).
  const selectable =
    value && !options.includes(value) ? [...options, value].sort(compareText) : options

  return (
    <label className="category-filter">
      {t.common.category}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t.filters.allCategories}</option>
        {selectable.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}
