import type { Ref } from 'react'
import { t } from '../i18n'

interface SearchFilterProps {
  value: string
  onChange: (term: string) => void
  /** Deixa o atalho "/" focar o campo de fora. */
  inputRef?: Ref<HTMLInputElement>
}

export function SearchFilter({ value, onChange, inputRef }: SearchFilterProps) {
  return (
    <label className="search-filter">
      {t.filters.search}
      <input
        ref={inputRef}
        type="search"
        aria-keyshortcuts="/"
        value={value}
        placeholder={t.filters.searchPlaceholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
