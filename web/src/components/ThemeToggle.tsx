import { useTheme } from '../hooks/use-theme'
import { toggleTheme } from '../lib/theme'

/**
 * Botão de tema. O rótulo diz para onde a ação leva ("Usar tema escuro"), não
 * onde se está — é o que o leitor de tela precisa ouvir antes de clicar —, e o
 * ícone fica `aria-hidden` para não virar leitura duplicada.
 */
export function ThemeToggle() {
  const theme = useTheme()
  const label = theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    </button>
  )
}
