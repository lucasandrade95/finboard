// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TagFilter } from './TagFilter'

afterEach(cleanup)

describe('TagFilter', () => {
  it('lista "Todas" e as tags recebidas', () => {
    render(<TagFilter value="" options={['cartão', 'viagem']} onChange={vi.fn()} />)

    const select = screen.getByLabelText('Tag') as HTMLSelectElement
    expect(select.value).toBe('')
    expect([...select.options].map((o) => o.textContent)).toEqual(['Todas', 'cartão', 'viagem'])
  })

  it('dispara onChange com a tag escolhida e com vazio ao limpar', () => {
    const onChange = vi.fn()
    render(<TagFilter value="viagem" options={['viagem']} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('some quando a conta ainda não usa tags', () => {
    const { container } = render(<TagFilter value="" options={[]} onChange={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('mantém a tag ativa visível quando ela sai das opções', () => {
    render(<TagFilter value="viagem" options={[]} onChange={vi.fn()} />)

    const select = screen.getByLabelText('Tag') as HTMLSelectElement
    expect(select.value).toBe('viagem')
  })
})
