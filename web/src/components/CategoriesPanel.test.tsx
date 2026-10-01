// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '../lib/api'
import { pathOf, recordRequests, server } from '../test/msw'
import { CategoriesPanel } from './CategoriesPanel'

function category(overrides: Partial<Category>): Category {
  return {
    id: 1,
    name: 'mercado',
    color: '#16a34a',
    icon: '🛒',
    createdAt: '2026-10-01 10:00:00',
    ...overrides,
  }
}

function renderPanel(categories: Category[] | undefined, loading = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <CategoriesPanel categories={categories} loading={loading} />
    </QueryClientProvider>,
  )
}

function submit(name: string, color = '#ea580c', icon = '') {
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Cor'), { target: { value: color } })
  fireEvent.change(screen.getByLabelText('Ícone (opcional)'), { target: { value: icon } })
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar categoria' }))
}

afterEach(cleanup)

describe('CategoriesPanel', () => {
  it('lista cada categoria com cor, ícone e botão Remover nomeado', () => {
    const { container } = renderPanel([
      category({ id: 1, name: 'mercado' }),
      category({ id: 2, name: 'saúde', color: '#dc2626', icon: null }),
    ])

    expect(screen.getByText('mercado')).toBeTruthy()
    expect(screen.getByText('🛒')).toBeTruthy()
    const swatches = container.querySelectorAll<HTMLElement>('.category-swatch')
    expect([...swatches].map((swatch) => swatch.style.background)).toEqual([
      'rgb(22, 163, 74)',
      'rgb(220, 38, 38)',
    ])
    // Sem ícone, nada de espaço vazio no lugar dele.
    expect(container.querySelectorAll('.category-icon')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Remover categoria saúde' })).toBeTruthy()
  })

  it('avisa quando não há categoria cadastrada', () => {
    renderPanel([])
    expect(screen.getByText('Nenhuma categoria cadastrada.')).toBeTruthy()
  })

  it('mostra skeleton enquanto carrega', () => {
    const { container } = renderPanel(undefined, true)
    expect(screen.getByText('Carregando categorias…')).toBeTruthy()
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })

  it('envia nome sem espaços, cor e ícone vazio como null', async () => {
    server.use(
      http.post('/api/categories/catalog', () =>
        HttpResponse.json(category({ name: 'lazer' }), { status: 201 }),
      ),
      http.get('/api/categories/catalog', () => HttpResponse.json({ items: [] })),
    )
    const requests = recordRequests()
    renderPanel([])

    submit('  lazer  ', '#9333ea', '  ')

    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(pathOf(requests[0]!)).toBe('/api/categories/catalog')
    expect(requests[0]!.method).toBe('POST')
    expect(await requests[0]!.json()).toEqual({ name: 'lazer', color: '#9333ea', icon: null })
    await vi.waitFor(() =>
      expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe(''),
    )
  })

  it('traduz o 409 de nome repetido numa mensagem legível', async () => {
    server.use(
      http.post('/api/categories/catalog', () =>
        HttpResponse.json({ error: 'category_exists' }, { status: 409 }),
      ),
    )
    renderPanel([category({ name: 'mercado' })])

    submit('Mercado')

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Já existe uma categoria com esse nome.',
    )
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Mercado')
  })

  it('remove pelo id da categoria', async () => {
    server.use(
      http.delete('/api/categories/catalog/:id', () => new HttpResponse(null, { status: 204 })),
      http.get('/api/categories/catalog', () => HttpResponse.json({ items: [] })),
    )
    const requests = recordRequests()
    renderPanel([category({ id: 7, name: 'mercado' })])

    fireEvent.click(screen.getByRole('button', { name: 'Remover categoria mercado' }))

    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(requests[0]!.method).toBe('DELETE')
    expect(pathOf(requests[0]!)).toBe('/api/categories/catalog/7')
  })
})
