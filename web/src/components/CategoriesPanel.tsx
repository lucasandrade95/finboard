import { useState, type FormEvent } from 'react'
import { useCreateCategory, useDeleteCategory } from '../hooks/use-finance'
import { t } from '../i18n'
import type { Category } from '../lib/api'
import { Skeleton } from './Skeleton'

const DEFAULT_COLOR = '#64748b'

interface CategoriesPanelProps {
  categories: Category[] | undefined
  loading: boolean
}

export function CategoriesPanel({ categories, loading }: CategoriesPanelProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [icon, setIcon] = useState('')
  const [error, setError] = useState<string | null>(null)
  const createCategory = useCreateCategory()
  const deleteCategory = useDeleteCategory()
  const items = categories ?? []

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    createCategory.mutate(
      { name: name.trim(), color, icon: icon.trim() || null },
      {
        onSuccess: () => {
          setName('')
          setColor(DEFAULT_COLOR)
          setIcon('')
        },
        // 409 é o nome repetido na conta: mensagem legível em vez do `API 409` cru.
        onError: (mutationError) =>
          setError(
            mutationError.message.startsWith('API 409')
              ? t.categories.alreadyExists
              : mutationError.message,
          ),
      },
    )
  }

  return (
    <section className="categories-panel card" aria-busy={loading}>
      <h2>{t.categories.title}</h2>
      {loading ? (
        <Skeleton lines={2} label={t.categories.loading} />
      ) : items.length === 0 ? (
        <p className="list-empty">{t.categories.empty}</p>
      ) : (
        <ul className="category-list">
          {items.map((category) => (
            <li key={category.id} className="category-item">
              <span
                className="category-swatch"
                style={{ background: category.color }}
                aria-hidden="true"
              />
              {category.icon && (
                <span className="category-icon" aria-hidden="true">
                  {category.icon}
                </span>
              )}
              <span className="category-name">{category.name}</span>
              <button
                type="button"
                className="delete-button"
                aria-label={t.categories.removeLabel(category.name)}
                onClick={() => deleteCategory.mutate(category.id)}
                disabled={deleteCategory.isPending}
              >
                {t.common.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="category-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            {t.categories.name}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.categories.namePlaceholder}
              required
              maxLength={50}
            />
          </label>
          <label>
            {t.categories.color}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <label>
            {t.categories.icon}
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder={t.categories.iconPlaceholder}
              maxLength={8}
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={createCategory.isPending}>
          {createCategory.isPending ? t.common.saving : t.categories.submit}
        </button>
      </form>
    </section>
  )
}
