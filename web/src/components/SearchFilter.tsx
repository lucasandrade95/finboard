import { t } from '../i18n'

interface SearchFilterProps {
  value: string
  onChange: (term: string) => void
}

export function SearchFilter({ value, onChange }: SearchFilterProps) {
  return (
    <label className="search-filter">
      {t.filters.search}
      <input
        type="search"
        value={value}
        placeholder={t.filters.searchPlaceholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
