// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchFilter } from './SearchFilter'

afterEach(cleanup)

describe('SearchFilter', () => {
  it('reflete o valor recebido no campo', () => {
    render(<SearchFilter value="mercado" onChange={vi.fn()} />)

    expect((screen.getByLabelText('Buscar') as HTMLInputElement).value).toBe('mercado')
  })

  it('dispara onChange a cada digitação', () => {
    const onChange = vi.fn()
    render(<SearchFilter value="" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'feira' } })
    expect(onChange).toHaveBeenCalledWith('feira')
  })

  it('permite limpar a busca', () => {
    const onChange = vi.fn()
    render(<SearchFilter value="feira" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith('')
  })
})
