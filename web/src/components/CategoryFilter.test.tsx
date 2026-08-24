// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CategoryFilter } from './CategoryFilter'

afterEach(cleanup)

describe('CategoryFilter', () => {
  it('lista "Todas" e as categorias recebidas', () => {
    render(<CategoryFilter value="" options={['alimentação', 'transporte']} onChange={vi.fn()} />)

    const select = screen.getByLabelText('Categoria') as HTMLSelectElement
    expect(select.value).toBe('')
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Todas',
      'alimentação',
      'transporte',
    ])
  })

  it('dispara onChange com a categoria escolhida', () => {
    const onChange = vi.fn()
    render(<CategoryFilter value="" options={['alimentação']} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'alimentação' } })
    expect(onChange).toHaveBeenCalledWith('alimentação')
  })

  it('volta para "Todas" ao escolher a opção vazia', () => {
    const onChange = vi.fn()
    render(<CategoryFilter value="alimentação" options={['alimentação']} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('mantém a categoria selecionada visível quando ela não está nas opções', () => {
    render(<CategoryFilter value="viagem" options={['alimentação']} onChange={vi.fn()} />)

    const select = screen.getByLabelText('Categoria') as HTMLSelectElement
    expect(select.value).toBe('viagem')
    expect([...select.options].map((o) => o.textContent)).toContain('viagem')
  })
})
