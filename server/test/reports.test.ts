import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { formatBrl, monthLabel } from '../src/modules/reports/monthly-report.js'
import { encodeWinAnsi, escapePdfString, PdfPage, renderPdf } from '../src/modules/reports/pdf.js'

const OWNER = { email: 'lucas@example.com', password: 'senha-forte-123' }
const OTHER = { email: 'maria@example.com', password: 'outra-senha-456' }

let app: FastifyInstance
let ownerAuth: string

async function registerAndAuthorize(credentials = OWNER): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: credentials,
  })
  return `Bearer ${response.json().token}`
}

async function inject(options: InjectOptions, auth = ownerAuth) {
  return app.inject({ ...options, headers: { authorization: auth, ...options.headers } })
}

async function createTransaction(overrides: Record<string, unknown>, auth = ownerAuth) {
  const response = await inject(
    {
      method: 'POST',
      url: '/api/transactions',
      payload: {
        type: 'expense',
        description: 'Mercado',
        amountCents: 10000,
        category: 'alimentação',
        occurredOn: '2026-08-10',
        ...overrides,
      },
    },
    auth,
  )
  expect(response.statusCode).toBe(201)
}

/** O PDF é escrito em WinAnsi: lido como Latin-1, os acentos do português voltam iguais. */
async function fetchReport(month = '2026-08', auth = ownerAuth) {
  const response = await inject(
    { method: 'GET', url: `/api/reports/monthly.pdf?month=${month}` },
    auth,
  )
  return { response, text: response.rawPayload.toString('latin1') }
}

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:', rateLimit: false })
  await app.ready()
  ownerAuth = await registerAndAuthorize()
})

afterEach(async () => {
  await app.close()
})

describe('GET /api/reports/monthly.pdf', () => {
  it('devolve um PDF para baixar com resumo, comparação e categorias do mês', async () => {
    await createTransaction({
      type: 'income',
      description: 'Salário',
      amountCents: 500000,
      category: 'renda',
      occurredOn: '2026-08-05',
    })
    await createTransaction({ amountCents: 123456, category: 'moradia' })
    await createTransaction({ amountCents: 4590, category: 'transporte', occurredOn: '2026-08-20' })
    // Mês anterior: entra só na comparação.
    await createTransaction({ amountCents: 20000, occurredOn: '2026-07-15' })

    const { response, text } = await fetchReport()

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('application/pdf')
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="relatorio-2026-08.pdf"',
    )
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(text.startsWith('%PDF-1.4\n')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)

    expect(text).toContain('Relatório mensal')
    expect(text).toContain('Agosto de 2026')
    expect(text).toContain('(R$ 5.000,00)')
    expect(text).toContain('(R$ 1.280,46)')
    expect(text).toContain('(R$ 3.719,54)')
    // Despesas subiram de R$ 200,00 para R$ 1.280,46 em relação a julho.
    expect(text).toContain('(+R$ 1.080,46 vs julho)')
    expect(text).toContain('(moradia)')
    expect(text).toContain('(R$ 1.234,56  \\(96%\\))')
    expect(text).toContain('(transporte)')
  })

  it('lista só as 5 maiores categorias e soma o resto numa linha', async () => {
    const categories = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    for (const [index, category] of categories.entries()) {
      await createTransaction({ category, amountCents: (categories.length - index) * 1000 })
    }

    const { text } = await fetchReport()

    for (const category of ['a', 'b', 'c', 'd', 'e']) {
      expect(text).toContain(`(${category}) Tj`)
    }
    expect(text).not.toContain('(f) Tj')
    expect(text).not.toContain('(g) Tj')
    // f (R$ 20) + g (R$ 10) = R$ 30 de R$ 280.
    expect(text).toContain('(Outras 2 categoria\\(s\\): R$ 30,00 \\(11%\\))')
  })

  it('gera o relatório de um mês vazio sem quebrar', async () => {
    const { response, text } = await fetchReport('2026-02')

    expect(response.statusCode).toBe(200)
    expect(text).toContain('(Nenhuma despesa no mês.)')
    expect(text).toContain('(dia 28)')
  })

  it('não mistura transações de outra conta', async () => {
    const otherAuth = await registerAndAuthorize(OTHER)
    await createTransaction({ amountCents: 777700, category: 'segredo' }, otherAuth)

    const { text } = await fetchReport()

    expect(text).not.toContain('segredo')
    expect(text).toContain('(Nenhuma despesa no mês.)')
  })

  it('exige mês válido e token', async () => {
    const missing = await inject({ method: 'GET', url: '/api/reports/monthly.pdf' })
    expect(missing.statusCode).toBe(400)
    expect(missing.json().error).toBe('validation_error')

    const malformed = await inject({ method: 'GET', url: '/api/reports/monthly.pdf?month=2026-8' })
    expect(malformed.statusCode).toBe(400)

    const anonymous = await app.inject({
      method: 'GET',
      url: '/api/reports/monthly.pdf?month=2026-08',
    })
    expect(anonymous.statusCode).toBe(401)
  })
})

describe('escritor de PDF', () => {
  it('aponta cada entrada da xref para o início do objeto certo', () => {
    const file = renderPdf(new PdfPage().text(50, 50, 'Olá (mundo)').rect(10, 10, 20, 5, '#ff0000'))
    const text = file.toString('latin1')

    const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1])
    expect(text.slice(startxref, startxref + 4)).toBe('xref')
    const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) =>
      Number(match[1]),
    )
    expect(offsets).toHaveLength(6)
    offsets.forEach((offset, index) => {
      expect(text.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true)
    })
  })

  it('declara o comprimento exato do stream de conteúdo', () => {
    const text = renderPdf(new PdfPage().text(0, 0, 'Relatório')).toString('latin1')
    const match = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(text)

    expect(Number(match?.[1])).toBe(match?.[2]?.length)
  })

  it('converte o eixo de cima para baixo da API para o eixo do PDF', () => {
    const content = new PdfPage().rect(50, 100, 200, 12, '#000000').contentStream()

    // A4 tem 842 pt de altura: topo em 100 com 12 de altura começa em 730 no PDF.
    expect(content).toBe('0 0 0 rg 50 730 200 12 re f')
  })

  it('gera os mesmos bytes para a mesma página', () => {
    const build = () => renderPdf(new PdfPage().text(10, 10, 'igual'))

    expect(build().equals(build())).toBe(true)
  })

  it('codifica acentos e pontuação em WinAnsi e troca o que não tem glifo', () => {
    expect(encodeWinAnsi('ação')).toBe('a\xe7\xe3o')
    expect(encodeWinAnsi('a — b…')).toBe('a \x97 b\x85')
    expect(encodeWinAnsi('−5')).toBe('-5')
    expect(encodeWinAnsi('🙂 ok')).toBe('? ok')
  })

  it('escapa parênteses e barra invertida das strings', () => {
    expect(escapePdfString('(a\\b)')).toBe('\\(a\\\\b\\)')
  })
})

describe('formatação do relatório', () => {
  it('formata centavos em reais sem passar por float', () => {
    expect(formatBrl(0)).toBe('R$ 0,00')
    expect(formatBrl(5)).toBe('R$ 0,05')
    expect(formatBrl(123456789)).toBe('R$ 1.234.567,89')
    expect(formatBrl(-4590)).toBe('-R$ 45,90')
    expect(formatBrl(100, { signed: true })).toBe('+R$ 1,00')
    expect(formatBrl(0, { signed: true })).toBe('R$ 0,00')
  })

  it('escreve o mês por extenso', () => {
    expect(monthLabel('2026-03')).toBe('março de 2026')
    expect(monthLabel('2025-12')).toBe('dezembro de 2025')
  })
})
