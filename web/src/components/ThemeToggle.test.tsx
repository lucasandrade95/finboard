// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { getThemePreference, setThemePreference } from '../lib/theme'
import { ThemeToggle } from './ThemeToggle'

afterEach(() => {
  cleanup()
  setThemePreference('system')
})

describe('ThemeToggle', () => {
  it('oferece o tema escuro quando a tela está clara', () => {
    setThemePreference('light')
    render(<ThemeToggle />)

    expect(screen.getByRole('button', { name: 'Usar tema escuro' })).toBeDefined()
  })

  it('troca de tema no clique e atualiza o rótulo', () => {
    setThemePreference('light')
    render(<ThemeToggle />)

    fireEvent.click(screen.getByRole('button', { name: 'Usar tema escuro' }))

    expect(getThemePreference()).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(screen.getByRole('button', { name: 'Usar tema claro' })).toBeDefined()
  })

  it('volta para o tema claro no segundo clique', () => {
    setThemePreference('dark')
    render(<ThemeToggle />)

    fireEvent.click(screen.getByRole('button', { name: 'Usar tema claro' }))

    expect(getThemePreference()).toBe('light')
    expect(screen.getByRole('button', { name: 'Usar tema escuro' })).toBeDefined()
  })
})
