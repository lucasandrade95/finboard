// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_RANGE } from '../lib/period'
import { PeriodFilter } from './PeriodFilter'

afterEach(cleanup)

describe('PeriodFilter', () => {
  it('mostra as duas datas vazias e sem botão de limpar', () => {
    render(<PeriodFilter value={EMPTY_RANGE} onChange={vi.fn()} />)

    expect((screen.getByLabelText('De') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Até') as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button', { name: 'Limpar período' })).toBeNull()
  })

  it('dispara onChange mantendo a outra ponta', () => {
    const onChange = vi.fn()
    render(<PeriodFilter value={{ from: '2026-08-01', to: '' }} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-08-15' } })
    expect(onChange).toHaveBeenCalledWith({ from: '2026-08-01', to: '2026-08-15' })
  })

  it('limita cada data pela outra no seletor nativo', () => {
    render(<PeriodFilter value={{ from: '2026-08-01', to: '2026-08-15' }} onChange={vi.fn()} />)

    expect(screen.getByLabelText('De').getAttribute('max')).toBe('2026-08-15')
    expect(screen.getByLabelText('Até').getAttribute('min')).toBe('2026-08-01')
  })

  it('limpa o período inteiro de uma vez', () => {
    const onChange = vi.fn()
    render(<PeriodFilter value={{ from: '2026-08-01', to: '2026-08-15' }} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Limpar período' }))
    expect(onChange).toHaveBeenCalledWith(EMPTY_RANGE)
  })

  it('avisa quando a data final é anterior à inicial', () => {
    render(<PeriodFilter value={{ from: '2026-08-15', to: '2026-08-01' }} onChange={vi.fn()} />)

    expect(screen.getByRole('alert').textContent).toMatch(/data final é anterior à inicial/)
    expect(screen.getByLabelText('De').getAttribute('aria-invalid')).toBe('true')
  })
})
