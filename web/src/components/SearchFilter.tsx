interface SearchFilterProps {
  value: string
  onChange: (term: string) => void
}

export function SearchFilter({ value, onChange }: SearchFilterProps) {
  return (
    <label className="search-filter">
      Buscar
      <input
        type="search"
        value={value}
        placeholder="descrição…"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
