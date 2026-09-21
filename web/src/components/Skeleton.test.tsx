// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Skeleton } from './Skeleton'

afterEach(cleanup)

describe('Skeleton', () => {
  it('desenha uma barra por linha pedida', () => {
    const { container } = render(<Skeleton lines={4} />)

    expect(container.querySelectorAll('.skeleton-bar')).toHaveLength(4)
  })

  it('anuncia o carregamento para leitor de tela e esconde as barras dele', () => {
    const { container } = render(<Skeleton lines={2} label="Carregando metas…" />)

    expect(screen.getByRole('status').textContent).toBe('Carregando metas…')
    // As barras não têm significado: quem lê a tela ouve só o rótulo.
    expect(container.querySelectorAll('.skeleton-bar[aria-hidden="true"]')).toHaveLength(2)
  })

  it('marca a variante de forma na classe para o CSS dar o tamanho', () => {
    const { container } = render(<Skeleton shape="circle" lines={1} />)

    expect(container.querySelector('.skeleton.skeleton-circle')).toBeTruthy()
  })

  it('usa texto de três linhas por padrão', () => {
    const { container } = render(<Skeleton />)

    expect(container.querySelector('.skeleton-text')).toBeTruthy()
    expect(container.querySelectorAll('.skeleton-bar')).toHaveLength(3)
    expect(screen.getByRole('status').textContent).toBe('Carregando…')
  })
})
