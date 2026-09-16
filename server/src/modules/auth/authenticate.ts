import type { FastifyReply, FastifyRequest } from 'fastify'

export interface TokenPayload {
  /** Id do usuário como string, conforme o claim `sub` do JWT. */
  sub: string
  email: string
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenPayload
    user: TokenPayload
  }
}

/**
 * preHandler para rotas protegidas. Qualquer falha (sem header, assinatura
 * inválida, token expirado) vira o mesmo 401 genérico: o motivo detalhado não
 * ajuda o cliente legítimo e ajuda quem está tentando forjar token.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'unauthorized' })
  }
}

/** Rotas que mexem em dinheiro de alguém: nenhuma responde sem token. */
export const protectedRoute = { preHandler: authenticate }

/** O `sub` do JWT é o id do usuário em string (claim padrão); os repositórios querem número. */
export function ownerId(request: FastifyRequest): number {
  return Number(request.user.sub)
}
