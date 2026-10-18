/**
 * O link do e-mail traz o token no fragmento (`/#reset=<token>`), não na query: o
 * navegador nunca manda o fragmento ao servidor, então o token não fica em log de
 * proxy nem vaza pelo header Referer. Só o tamanho de um token de verdade é aceito.
 */
const RESET_HASH = /^#reset=([A-Za-z0-9_-]{16,256})$/

export function readResetToken(hash: string): string | null {
  return RESET_HASH.exec(hash)?.[1] ?? null
}

/**
 * Tira o token da barra de endereço depois de usado (ou abandonado). `replaceState`
 * em vez de `location.hash = ''`: não cria entrada no histórico, então o "voltar"
 * do navegador não reabre a tela com um link que já não vale.
 */
export function clearResetHash(): void {
  history.replaceState(null, '', `${location.pathname}${location.search}`)
}
