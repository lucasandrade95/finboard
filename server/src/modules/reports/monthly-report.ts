import type {
  DailyBalance,
  ExpensesByCategory,
  SummaryWithComparison,
} from '../transactions/repository.js'
import { PAGE_WIDTH, PdfPage, renderPdf } from './pdf.js'

export interface MonthlyReportData {
  month: string
  summary: SummaryWithComparison
  expenses: ExpensesByCategory
  daily: DailyBalance
}

/** Além disso o relatório vira lista longa: o resto entra somado numa linha "outras". */
export const TOP_CATEGORIES = 5

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

const MARGIN = 50
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const INK = '#1f2937'
const MUTED = '#6b7280'
const GRID = '#e5e7eb'
const INCOME = '#16a34a'
const EXPENSE = '#dc2626'
const ACCENT = '#2563eb'
// Helvetica 10pt cabe ~25 caracteres na coluna de rótulo antes da barra.
const LABEL_MAX_CHARS = 24

/** `2026-08` → `agosto de 2026`. */
export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-')
  return `${MONTH_NAMES[Number(monthNumber) - 1]} de ${year}`
}

/**
 * Centavos → `R$ 1.234,56` por aritmética inteira, como no CSV: o valor nunca passa
 * por float. Sem `Intl` de propósito, porque o espaço que ele usa (U+00A0) e o sinal
 * de menos variam por versão do ICU e o arquivo deixaria de ser determinístico.
 */
export function formatBrl(cents: number, { signed = false } = {}): string {
  const absolute = Math.abs(cents)
  const reais = String(Math.floor(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const value = `R$ ${reais},${String(absolute % 100).padStart(2, '0')}`
  if (cents < 0) return `-${value}`
  return signed && cents > 0 ? `+${value}` : value
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Fatia de `part` em `total`, em percentual inteiro; total zero não divide. */
function percentOf(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part * 100) / total)
}

function sectionTitle(page: PdfPage, y: number, title: string): void {
  page.text(MARGIN, y, title, { size: 13, font: 'bold', color: INK })
  page.rect(MARGIN, y + 6, CONTENT_WIDTH, 0.75, GRID)
}

function drawSummary(page: PdfPage, y: number, { summary }: MonthlyReportData): void {
  const previous = summary.previous
  const cards = [
    { label: 'Receitas', cents: summary.incomeCents, before: previous?.incomeCents, color: INCOME },
    {
      label: 'Despesas',
      cents: summary.expenseCents,
      before: previous?.expenseCents,
      color: EXPENSE,
    },
    {
      label: 'Saldo',
      cents: summary.balanceCents,
      before: previous?.balanceCents,
      color: summary.balanceCents < 0 ? EXPENSE : INK,
    },
  ]
  const columnWidth = CONTENT_WIDTH / cards.length
  cards.forEach((card, index) => {
    const x = MARGIN + columnWidth * index
    page.text(x, y, card.label, { size: 10, color: MUTED })
    page.text(x, y + 20, formatBrl(card.cents), { size: 16, font: 'bold', color: card.color })
    if (previous && card.before !== undefined) {
      page.text(
        x,
        y + 36,
        `${formatBrl(card.cents - card.before, { signed: true })} vs ${MONTH_NAMES[Number(previous.month.slice(5)) - 1]}`,
        { size: 9, color: MUTED },
      )
    }
  })
}

/** Barras horizontais na mesma escala: a maior ocupa a largura toda. */
function drawBars(
  page: PdfPage,
  y: number,
  rows: Array<{ label: string; cents: number; color: string; note?: string }>,
): number {
  const barX = MARGIN + 150
  const barWidth = 220
  const largest = Math.max(...rows.map((row) => row.cents), 1)
  rows.forEach((row, index) => {
    const rowY = y + index * 24
    page.text(MARGIN, rowY + 10, truncate(row.label, LABEL_MAX_CHARS), { color: INK })
    page.rect(barX, rowY, barWidth, 12, GRID)
    page.rect(barX, rowY, (barWidth * row.cents) / largest, 12, row.color)
    const value = row.note ? `${formatBrl(row.cents)}  (${row.note})` : formatBrl(row.cents)
    page.text(barX + barWidth + 10, rowY + 10, value, { color: INK })
  })
  return y + rows.length * 24
}

/**
 * Linha do saldo acumulado dia a dia. O domínio vertical sempre inclui o zero, como
 * no gráfico do front: mês só de despesas aparece como queda, não como reta no meio.
 */
function drawBalanceLine(page: PdfPage, y: number, { daily }: MonthlyReportData): void {
  const height = 110
  const balances = daily.items.map((item) => item.balanceCents)
  const max = Math.max(0, ...balances)
  const min = Math.min(0, ...balances)
  const range = max - min || 1
  const toY = (cents: number) => y + ((max - cents) / range) * height
  const step = CONTENT_WIDTH / Math.max(daily.items.length - 1, 1)

  page.rect(MARGIN, toY(0), CONTENT_WIDTH, 0.75, MUTED)
  page.polyline(
    balances.map((cents, index) => [MARGIN + step * index, toY(cents)]),
    ACCENT,
    1.5,
  )
  const last = daily.items.at(-1)
  page.text(MARGIN, y + height + 16, 'dia 1', { size: 8, color: MUTED })
  page.text(MARGIN + CONTENT_WIDTH - 30, y + height + 16, `dia ${daily.items.length}`, {
    size: 8,
    color: MUTED,
  })
  page.text(
    MARGIN,
    y + height + 32,
    `Saldo final ${formatBrl(last?.balanceCents ?? 0)}  ·  pico ${formatBrl(max)}  ·  fundo ${formatBrl(min)}`,
    { size: 9, color: INK },
  )
}

function drawTopCategories(page: PdfPage, y: number, { expenses }: MonthlyReportData): void {
  if (expenses.items.length === 0) {
    page.text(MARGIN, y + 10, 'Nenhuma despesa no mês.', { color: MUTED })
    return
  }
  const top = expenses.items.slice(0, TOP_CATEGORIES)
  const end = drawBars(
    page,
    y,
    top.map((item) => ({
      label: item.category,
      cents: item.totalCents,
      color: EXPENSE,
      note: `${percentOf(item.totalCents, expenses.totalCents)}%`,
    })),
  )
  const rest = expenses.items.slice(TOP_CATEGORIES)
  if (rest.length > 0) {
    const restCents = rest.reduce((sum, item) => sum + item.totalCents, 0)
    page.text(
      MARGIN,
      end + 10,
      `Outras ${rest.length} categoria(s): ${formatBrl(restCents)} (${percentOf(restCents, expenses.totalCents)}%)`,
      { size: 9, color: MUTED },
    )
  }
}

/**
 * Relatório de uma página: resumo com comparação ao mês anterior, receitas × despesas,
 * saldo dia a dia e as maiores categorias de gasto. Função pura de dados → bytes.
 */
export function renderMonthlyReport(data: MonthlyReportData): Buffer {
  const page = new PdfPage()
  page.text(MARGIN, 60, 'Finboard', { size: 22, font: 'bold', color: ACCENT })
  page.text(MARGIN, 84, `Relatório mensal — ${capitalize(monthLabel(data.month))}`, {
    size: 14,
    color: INK,
  })

  sectionTitle(page, 125, 'Resumo')
  drawSummary(page, 155, data)

  sectionTitle(page, 230, 'Receitas × despesas')
  drawBars(page, 250, [
    { label: 'Receitas', cents: data.summary.incomeCents, color: INCOME },
    { label: 'Despesas', cents: data.summary.expenseCents, color: EXPENSE },
  ])

  sectionTitle(page, 330, 'Saldo ao longo do mês')
  drawBalanceLine(page, 350, data)

  sectionTitle(page, 545, `Top ${TOP_CATEGORIES} categorias de despesa`)
  drawTopCategories(page, 565, data)

  page.text(
    MARGIN,
    805,
    'Valores em reais. Transferências entre contas não entram em receitas nem despesas.',
    { size: 8, color: MUTED },
  )
  return renderPdf(page)
}
