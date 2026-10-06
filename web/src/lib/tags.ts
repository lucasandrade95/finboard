import { locale } from '../i18n'

// Mesmos limites do Zod do server: o formulário avisa antes de a API recusar com 400.
export const MAX_TAGS = 10
export const MAX_TAG_LENGTH = 30

/**
 * O campo de tags é texto livre separado por vírgula: "viagem, Férias,, viagem"
 * vira ['viagem', 'Férias']. Repetidas sem diferenciar maiúsculas ficam uma vez só,
 * como o server faria — assim o que a pessoa vê depois de salvar não muda.
 */
export function parseTagsInput(text: string): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const part of text.split(',')) {
    const tag = part.trim()
    const key = tag.toLocaleLowerCase(locale)
    if (tag && !seen.has(key)) {
      seen.add(key)
      tags.push(tag)
    }
  }
  return tags
}

export function formatTagsInput(tags: string[]): string {
  return tags.join(', ')
}

export function tagsWithinLimits(tags: string[]): boolean {
  return tags.length <= MAX_TAGS && tags.every((tag) => tag.length <= MAX_TAG_LENGTH)
}
