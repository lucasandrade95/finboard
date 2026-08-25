// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TypeFilter } from './TypeFilter'

afterEach(cleanup)

describe('TypeFilter', () => {
  it('lista "Todos", receitas e despesas', () => {
    render(<TypeFilter value="" onChange={vi.fn()} />)

    const select = screen.getByLabelText('Tipo') as HTMLSelectElement
    expect(select.value).toBe('')
    expect([...select.options].map((o) => o.textContent)).toEqual(['Todos', 'Receitas', 'Despesas'])
  })

  it('dispara onChange com o tipo escolhido', () => {
    const onChange = vi.fn()
    render(<TypeFilter value="" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'expense' } })
    expect(onChange).toHaveBeenCalledWith('expense')
  })

  it('volta para "Todos" ao escolher a opção vazia', () => {
    const onChange = vi.fn()
    render(<TypeFilter value="income" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('reflete o valor recebido no select', () => {
    render(<TypeFilter value="income" onChange={vi.fn()} />)

    expect((screen.getByLabelText('Tipo') as HTMLSelectElement).value).toBe('income')
  })
})
