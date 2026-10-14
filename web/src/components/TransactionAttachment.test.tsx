// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../lib/api'
import { MAX_ATTACHMENT_BYTES } from '../lib/attachments'
import { pathOf, recordRequests, server } from '../test/msw'
import { TransactionAttachment } from './TransactionAttachment'

const transaction: Transaction = {
  id: 7,
  type: 'expense',
  description: 'Farmácia',
  amountCents: 4590,
  category: 'saúde',
  occurredOn: '2026-10-14',
  recurring: false,
  accountId: null,
  transferId: null,
  installmentId: null,
  installmentNumber: null,
  tags: [],
  hasAttachment: false,
  createdAt: '2026-10-14 12:00:00',
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// jsdom não implementa URLs de blob: o teste só confere que o preview usa uma.
const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:finboard/comprovante')
const revokeObjectURL = vi.fn<(url: string) => void>()

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
})

afterEach(() => {
  cleanup()
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  vi.restoreAllMocks()
})

function renderAttachment(overrides: Partial<Transaction> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionAttachment transaction={{ ...transaction, ...overrides }} />
    </QueryClientProvider>,
  )
}

// O jsdom não implementa Blob.arrayBuffer(): o arquivo de teste traz o método pronto.
function attachmentFile(bytes: Uint8Array<ArrayBuffer>, name: string, type: string): File {
  const file = new File([bytes], name, { type })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.slice().buffer),
  })
  return file
}

function chooseFile(file: File) {
  fireEvent.change(screen.getByLabelText('Anexar comprovante a Farmácia'), {
    target: { files: [file] },
  })
}

function mockDownload(body: Uint8Array, contentType: string) {
  server.use(
    http.get('/api/transactions/:id/attachment', () =>
      HttpResponse.arrayBuffer(body.slice().buffer, { headers: { 'content-type': contentType } }),
    ),
  )
}

function openPreview() {
  fireEvent.click(screen.getByRole('button', { name: 'Ver comprovante de Farmácia' }))
}

describe('TransactionAttachment', () => {
  it('envia o arquivo escolhido como corpo cru com o tipo dele', async () => {
    server.use(
      http.put('/api/transactions/:id/attachment', () =>
        HttpResponse.json({ transactionId: 7, mimeType: 'image/png', sizeBytes: 8 }),
      ),
    )
    const requests = recordRequests()
    renderAttachment()

    chooseFile(attachmentFile(PNG_BYTES, 'nota.png', 'image/png'))

    await waitFor(() => expect(requests).toHaveLength(1))
    const sent = requests[0]!
    expect(sent.method).toBe('PUT')
    expect(pathOf(sent)).toBe('/api/transactions/7/attachment')
    expect(sent.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(PNG_BYTES)
  })

  it('barra arquivo acima de 2 MB sem chamar a API', () => {
    const requests = recordRequests()
    renderAttachment()

    chooseFile(
      new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'foto.jpg', { type: 'image/jpeg' }),
    )

    expect(screen.getByRole('alert').textContent).toBe('O arquivo precisa ter até 2 MB.')
    expect(requests).toHaveLength(0)
  })

  it('barra tipo fora da lista sem chamar a API', () => {
    const requests = recordRequests()
    renderAttachment()

    chooseFile(new File(['GIF89a'], 'meme.gif', { type: 'image/gif' }))

    expect(screen.getByRole('alert').textContent).toBe('Use uma imagem (PNG, JPEG, WebP) ou PDF.')
    expect(requests).toHaveLength(0)
  })

  it('avisa quando o envio falha', async () => {
    server.use(
      http.put('/api/transactions/:id/attachment', () =>
        HttpResponse.json({ error: 'invalid_file' }, { status: 400 }),
      ),
    )
    renderAttachment()

    chooseFile(attachmentFile(PNG_BYTES, 'nota.png', 'image/png'))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Falha ao enviar o comprovante. Tente de novo.',
    )
  })

  it('mostra a imagem do comprovante num diálogo com o foco no Fechar', async () => {
    mockDownload(PNG_BYTES, 'image/png')
    renderAttachment({ hasAttachment: true })

    openPreview()

    const dialog = screen.getByRole('dialog', { name: 'Comprovante — Farmácia' })
    expect(dialog).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fechar' }))
    const image = (await screen.findByRole('img', {
      name: 'Comprovante de Farmácia',
    })) as HTMLImageElement
    expect(image.getAttribute('src')).toBe('blob:finboard/comprovante')
    expect(createObjectURL.mock.calls[0]?.[0].type).toBe('image/png')
  })

  it('mostra PDF num iframe em vez de imagem', async () => {
    mockDownload(new TextEncoder().encode('%PDF-1.7'), 'application/pdf')
    renderAttachment({ hasAttachment: true })

    openPreview()

    const frame = await screen.findByTitle('Comprovante de Farmácia')
    expect(frame.tagName).toBe('IFRAME')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('fecha com Esc, devolve o foco e libera a URL do blob', async () => {
    mockDownload(PNG_BYTES, 'image/png')
    renderAttachment({ hasAttachment: true })
    const opener = screen.getByRole('button', { name: 'Ver comprovante de Farmácia' })
    opener.focus()

    openPreview()
    await screen.findByRole('img')
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:finboard/comprovante')
  })

  it('remove o comprovante após confirmação e fecha o diálogo', async () => {
    mockDownload(PNG_BYTES, 'image/png')
    server.use(
      http.delete(
        '/api/transactions/:id/attachment',
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    const requests = recordRequests()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderAttachment({ hasAttachment: true })

    openPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Remover comprovante' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const removal = requests.find((request) => request.method === 'DELETE')
    expect(removal && pathOf(removal)).toBe('/api/transactions/7/attachment')
  })

  it('não remove nada se a confirmação for cancelada', () => {
    mockDownload(PNG_BYTES, 'image/png')
    const requests = recordRequests()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderAttachment({ hasAttachment: true })

    openPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Remover comprovante' }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false)
  })
})
