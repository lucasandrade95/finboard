import { ptBR, type Messages } from './pt-BR'

export type { Messages } from './pt-BR'

export type Locale = 'pt-BR'

export const DEFAULT_LOCALE: Locale = 'pt-BR'

// Um idioma novo entra aqui: o tipo `Record<Locale, Messages>` obriga o dicionário
// a ter todas as chaves do pt-BR antes de compilar.
const dictionaries: Record<Locale, Messages> = {
  'pt-BR': ptBR,
}

/** Idioma ativo. Por ora fixo no padrão; trocar é mudar só esta linha (ou lê-la da sessão). */
export const locale: Locale = DEFAULT_LOCALE

/** Textos da interface no idioma ativo. Componentes leem daqui em vez de ter string solta. */
export const t: Messages = dictionaries[locale]

/**
 * Ordenação alfabética no idioma ativo. Comparar byte a byte jogaria "água"
 * depois de "transporte"; o collator do idioma põe acentuados no lugar certo.
 */
export function compareText(a: string, b: string): number {
  return a.localeCompare(b, locale)
}

/**
 * `<html lang>` acompanha o dicionário: é o que faz o leitor de tela pronunciar
 * os textos no idioma certo, e o `index.html` sozinho ficaria fixo em pt-BR.
 */
export function applyDocumentLocale(): void {
  document.documentElement.lang = locale
}
