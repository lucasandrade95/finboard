export type ThemePreference = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'finboard.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * Store do tema, no mesmo formato do store do token (`lib/auth.ts`): valor em
 * memória, espelho em `localStorage` e ouvintes para o React reagir via
 * `useSyncExternalStore` — ver `hooks/use-theme.ts`.
 *
 * A preferência tem três estados, não dois: `system` (padrão) segue o
 * `prefers-color-scheme` do SO e continua acompanhando se ele mudar com a página
 * aberta; `light`/`dark` são escolha explícita e sobrepõem o SO. O que persiste é
 * a preferência, nunca o tema resolvido — guardar "dark" porque o SO estava
 * escuro no primeiro acesso congelaria a página no escuro para sempre.
 *
 * As cores em si vivem no CSS: o store só escreve `data-theme` no `<html>`
 * (removido quando a preferência é `system`, e aí a media query do `styles.css`
 * assume). Assim o tema do SO já vale no primeiro paint, antes deste módulo rodar.
 */
let preference: ThemePreference = readStoredPreference()
let mediaBound = false
const listeners = new Set<() => void>()

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    // Safari em modo privado pode lançar ao ler storage: sem preferência, segue o SO.
    return 'system'
  }
}

function darkMediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null
  }
  return window.matchMedia(DARK_QUERY)
}

function applyPreference(): void {
  if (typeof document === 'undefined') {
    return
  }
  const root = document.documentElement
  if (preference === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', preference)
  }
}

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function getThemePreference(): ThemePreference {
  return preference
}

/** Tema que está valendo na tela: a preferência explícita ou o que o SO pede. */
export function getTheme(): Theme {
  if (preference !== 'system') {
    return preference
  }
  return darkMediaQuery()?.matches ? 'dark' : 'light'
}

export function setThemePreference(next: ThemePreference): void {
  if (preference === next) {
    return
  }
  preference = next
  try {
    if (next === 'system') {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, next)
    }
  } catch {
    // Falhar ao persistir não pode impedir a troca de tema nesta sessão.
  }
  applyPreference()
  notify()
}

/** Inverte o tema que está na tela, virando a escolha em explícita. */
export function toggleTheme(): void {
  setThemePreference(getTheme() === 'dark' ? 'light' : 'dark')
}

export function subscribeToTheme(listener: () => void): () => void {
  bindSystemChanges()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * O SO pode trocar de tema com a página aberta (modo noturno por horário). O CSS
 * reage sozinho pela media query; o aviso aqui existe para o botão trocar de
 * ícone. A assinatura é feita no primeiro `subscribe`, e não na carga do módulo,
 * para importar o store não depender de `matchMedia` existir.
 */
function bindSystemChanges(): void {
  if (mediaBound) {
    return
  }
  const query = darkMediaQuery()
  if (!query) {
    return
  }
  mediaBound = true
  query.addEventListener('change', () => {
    if (preference === 'system') {
      notify()
    }
  })
}

applyPreference()
