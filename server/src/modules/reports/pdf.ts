/**
 * Escritor mínimo de PDF 1.4: uma página, texto nas fontes padrão (Helvetica e
 * Helvetica-Bold, que todo leitor já tem embutidas) e formas sólidas. É o bastante
 * para um relatório com barras e linha, sem puxar uma biblioteca de PDF inteira —
 * mesma escolha dos gráficos SVG do front.
 *
 * As coordenadas da API são de cima para baixo (como em tela); a conversão para o
 * eixo do PDF, que cresce de baixo para cima, acontece só aqui dentro.
 */

/** A4 em pontos (1/72 de polegada). */
export const PAGE_WIDTH = 595
export const PAGE_HEIGHT = 842

export type PdfFont = 'regular' | 'bold'

export interface TextOptions {
  size?: number
  font?: PdfFont
  /** Cor no formato `#rrggbb`. */
  color?: string
}

const FONT_RESOURCE: Record<PdfFont, string> = { regular: 'F1', bold: 'F2' }

// Fora do Latin-1, o WinAnsiEncoding põe a pontuação tipográfica entre 0x80 e 0x9F.
const WIN_ANSI_EXTRAS: Record<string, number> = {
  '€': 0x80,
  '…': 0x85,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
}

/**
 * Texto → string de bytes WinAnsi (um char por byte). Acentos do português caem no
 * Latin-1, que coincide com o WinAnsi de 0xA0 a 0xFF; o que não tem glifo vira `?`
 * em vez de bytes UTF-8 que o leitor mostraria como lixo.
 */
export function encodeWinAnsi(text: string): string {
  let encoded = ''
  for (const char of text) {
    const code = char.codePointAt(0)!
    const extra = WIN_ANSI_EXTRAS[char]
    if (extra !== undefined) {
      encoded += String.fromCharCode(extra)
    } else if (code === 0x2212) {
      encoded += '-'
    } else if ((code >= 0x20 && code < 0x7f) || (code >= 0xa0 && code <= 0xff)) {
      encoded += char
    } else {
      encoded += '?'
    }
  }
  return encoded
}

/** Parênteses e barra invertida delimitam strings literais no PDF: precisam de escape. */
export function escapePdfString(encoded: string): string {
  return encoded.replace(/[\\()]/g, (char) => `\\${char}`)
}

// Duas casas bastam (1/7200 de polegada) e evitam `0.30000000000000004` no arquivo.
function num(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function rgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
    .map((channel) => num(channel / 255))
    .join(' ')
}

export class PdfPage {
  private readonly operations: string[] = []

  text(x: number, y: number, content: string, options: TextOptions = {}): this {
    const size = options.size ?? 10
    const font = FONT_RESOURCE[options.font ?? 'regular']
    this.operations.push(
      `BT /${font} ${num(size)} Tf ${rgb(options.color ?? '#000000')} rg ` +
        `${num(x)} ${num(PAGE_HEIGHT - y)} Td (${escapePdfString(encodeWinAnsi(content))}) Tj ET`,
    )
    return this
  }

  /** Retângulo preenchido com o canto superior esquerdo em (x, y). */
  rect(x: number, y: number, width: number, height: number, color: string): this {
    this.operations.push(
      `${rgb(color)} rg ${num(x)} ${num(PAGE_HEIGHT - y - height)} ${num(width)} ${num(height)} re f`,
    )
    return this
  }

  polyline(points: Array<[number, number]>, color: string, lineWidth = 1): this {
    if (points.length < 2) return this
    const path = points
      .map(([x, y], index) => `${num(x)} ${num(PAGE_HEIGHT - y)} ${index === 0 ? 'm' : 'l'}`)
      .join(' ')
    this.operations.push(`${rgb(color)} RG ${num(lineWidth)} w 1 j ${path} S`)
    return this
  }

  /** Stream de conteúdo da página, já em bytes WinAnsi. */
  contentStream(): string {
    return this.operations.join('\n')
  }
}

/**
 * Monta o arquivo: catálogo → árvore de páginas → página → fontes → conteúdo, e a
 * tabela xref com o deslocamento em bytes de cada objeto. Sem data de criação, a
 * mesma página gera sempre os mesmos bytes (o teste compara direto).
 */
export function renderPdf(page: PdfPage): Buffer {
  const content = page.contentStream()
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      '/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    // Um char por byte: o comprimento da string é o comprimento do stream.
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]

  // O comentário com bytes altos avisa ferramentas de transferência que o arquivo é binário.
  let file = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(file.length)
    file += `${index + 1} 0 obj\n${body}\nendobj\n`
  })

  const xrefOffset = file.length
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    file += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(file, 'latin1')
}
