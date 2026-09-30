// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { applyDocumentLocale, compareText, DEFAULT_LOCALE, locale, t } from '.'
import { ptBR } from './pt-BR'

type Entry = [path: string, value: unknown]

function flatten(node: object, prefix = ''): Entry[] {
  return Object.entries(node).flatMap(([key, value]): Entry[] => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'object' && value !== null
      ? flatten(value as object, path)
      : [[path, value]]
  })
}

describe('i18n', () => {
  afterEach(() => {
    document.documentElement.lang = ''
  })

  it('usa pt-BR como idioma padrão', () => {
    expect(DEFAULT_LOCALE).toBe('pt-BR')
    expect(locale).toBe('pt-BR')
    expect(t).toBe(ptBR)
  })

  it('não tem texto vazio no dicionário, nem nas mensagens com parâmetro', () => {
    const entries = flatten(ptBR)

    expect(entries.length).toBeGreaterThan(50)
    for (const [path, value] of entries) {
      // Parâmetros fictícios: o que importa é a função devolver texto, não o texto em si.
      const text: unknown =
        typeof value === 'function'
          ? (value as (...args: unknown[]) => unknown)(
              ...Array.from({ length: value.length }, () => '2'),
            )
          : value
      expect(typeof text, path).toBe('string')
      expect((text as string).trim(), path).not.toBe('')
      expect(text as string, path).not.toContain('undefined')
    }
  })

  it('concorda singular e plural nas mensagens com contagem', () => {
    expect(t.budgets.overAlert(1)).toBe('1 orçamento estourou este mês.')
    expect(t.budgets.overAlert(3)).toBe('3 orçamentos estouraram este mês.')
    expect(t.csv.imported(1)).toBe('1 transação importada.')
    expect(t.csv.imported(2)).toBe('2 transações importadas.')
    expect(t.goals.monthlyNeeded('R$ 100,00', 1)).toBe(
      'Guarde R$ 100,00 por mês (1 mês) para chegar lá.',
    )
    expect(t.goals.monthlyNeeded('R$ 100,00', 4)).toBe(
      'Guarde R$ 100,00 por mês (4 meses) para chegar lá.',
    )
  })

  it('só mostra a coluna do erro de CSV quando ela existe', () => {
    expect(t.csv.rowError(3, 'amount', 'valor inválido')).toBe('Linha 3 (amount): valor inválido')
    expect(t.csv.rowError(3, undefined, 'colunas faltando')).toBe('Linha 3: colunas faltando')
  })

  it('ordena texto com as regras do idioma, acentos no lugar certo', () => {
    expect(['transporte', 'água', 'Mercado'].sort(compareText)).toEqual([
      'água',
      'Mercado',
      'transporte',
    ])
  })

  it('marca o documento com o idioma ativo para o leitor de tela pronunciar certo', () => {
    applyDocumentLocale()

    expect(document.documentElement.lang).toBe('pt-BR')
  })
})

// Guarda contra regressão: texto de interface escrito direto no JSX volta a espalhar
// strings e quebra a troca de idioma sem nenhum teste de componente perceber.
const sources = import.meta.glob<string>(['../components/*.tsx', '../App.tsx', '!**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('componentes sem texto fixo', () => {
  const files = Object.entries(sources)

  it('encontra os arquivos de componente', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it.each(files)('%s lê os textos do dicionário', (_file, source) => {
    // Texto solto entre tags (ex.: `>Salvar</button>` ou uma linha só com "Salvar").
    // O lookbehind ignora `=>` e `>=`, que não são fim de tag.
    const jsxText =
      /((?<![=-])>[ \t]*[A-Za-zÀ-ú][^<>{}()\n]*<\/?[A-Za-z])|(^\s+[A-ZÀ-Ú][a-zà-ú]+( [a-zà-ú]+)*\s*$)/m
    // Atributos que o usuário lê ou ouve, com literal em vez de expressão.
    const literalAttribute = /\b(aria-label|placeholder|title|label)="[^"]*[A-Za-zÀ-ú]/

    expect(source).not.toMatch(jsxText)
    expect(source).not.toMatch(literalAttribute)
  })
})
