// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CategoryDonut } from './CategoryDonut'

afterEach(cleanup)

describe('CategoryDonut', () => {
  it('mostra legenda com valor e percentual de cada categoria', () => {
    const { container } = render(
      <CategoryDonut
        data={{
          items: [
            { category: 'aluguel', totalCents: 150000 },
            { category: 'mercado', totalCents: 50000 },
          ],
          totalCents: 200000,
        }}
        loading={false}
      />,
    )

    expect(screen.getByText('aluguel')).toBeTruthy()
    expect(screen.getByText('75,0%')).toBeTruthy()
    expect(screen.getByText('25,0%')).toBeTruthy()
    expect(screen.getByText(/1\.500,00/)).toBeTruthy()
    // Uma fatia por categoria — o donut é desenhado com círculos, sem biblioteca.
    expect(container.querySelectorAll('svg circle')).toHaveLength(2)
  })

  it('mostra o total do mês no centro do donut', () => {
    render(
      <CategoryDonut
        data={{ items: [{ category: 'mercado', totalCents: 50000 }], totalCents: 50000 }}
        loading={false}
      />,
    )

    expect(screen.getByText('Total')).toBeTruthy()
    expect(screen.getAllByText(/500,00/).length).toBeGreaterThan(0)
  })

  it('avisa quando não há despesas no mês', () => {
    render(<CategoryDonut data={{ items: [], totalCents: 0 }} loading={false} />)

    expect(screen.getByText('Nenhuma despesa neste mês.')).toBeTruthy()
    expect(screen.queryByText('Total')).toBeNull()
  })

  it('mostra estado de carregamento', () => {
    const { container } = render(<CategoryDonut data={undefined} loading={true} />)

    expect(screen.getByText('Carregando…')).toBeTruthy()
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })
})
