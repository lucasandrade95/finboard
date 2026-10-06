import { compareText, t } from '../i18n'

interface TagFilterProps {
  value: string
  options: string[]
  onChange: (tag: string) => void
}

export function TagFilter({ value, options, onChange }: TagFilterProps) {
  // Quem nunca usou tag não precisa de um select vazio na barra de filtros.
  if (options.length === 0 && !value) {
    return null
  }
  // Mesma regra do filtro de categoria: a tag ativa continua visível mesmo fora das opções.
  const selectable =
    value && !options.includes(value) ? [...options, value].sort(compareText) : options

  return (
    <label className="category-filter">
      {t.tags.filter}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t.tags.allTags}</option>
        {selectable.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}
