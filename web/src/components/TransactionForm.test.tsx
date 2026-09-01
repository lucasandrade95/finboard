// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TransactionForm } from './TransactionForm'

function renderForm(categories?: string[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionForm categories={categories} />
    </QueryClientProvider>,
  )
}

afterEach(cleanup)

describe('TransactionForm', () => {
  it('liga o campo de categoria ao datalist de sugestões', () => {
    const { container } = renderForm(['alimentação', 'transporte'])

    const input = screen.getByLabelText('Categoria')
    const listId = input.getAttribute('list')
    expect(listId).toBe('category-suggestions')

    const options = container.querySelectorAll(`datalist#${listId} option`)
    expect([...options].map((option) => option.getAttribute('value'))).toEqual([
      'alimentação',
      'transporte',
    ])
  })

  it('mantém o campo livre para digitar uma categoria nova', () => {
    renderForm([])

    const input = screen.getByLabelText('Categoria') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.value).toBe('')
  })

  it('oferece o checkbox de recorrência desmarcado por padrão', () => {
    renderForm([])

    const checkbox = screen.getByRole('checkbox', { name: 'Repetir todo mês' }) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })
})
