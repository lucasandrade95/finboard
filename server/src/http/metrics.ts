import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifySchema } from 'fastify'

/**
 * Limites do histograma de latência, em segundos. Cobrem do SELECT por id (poucos ms)
 * ao PDF mensal e ao hash argon2 do login (centenas de ms), sem estourar o número
 * de séries: cada balde vira uma linha por rota.
 */
export const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5] as const

export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8'

/** Rota que não casou com nenhuma registrada: a URL crua explodiria a cardinalidade. */
export const UNMATCHED_ROUTE = 'unmatched'

interface Histogram {
  /** Contagem por balde, não acumulada; a soma acumulada sai só na hora de renderizar. */
  buckets: number[]
  count: number
  sum: number
}

/** Valor de label no formato de texto do Prometheus: `\`, `"` e quebra de linha escapados. */
function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function labels(pairs: Record<string, string>): string {
  const body = Object.entries(pairs)
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(',')
  return `{${body}}`
}

/**
 * Registro em memória, um por instância do app. Sem `prom-client` de propósito: são
 * dois tipos de métrica (contador e histograma) e o formato de texto é simples — uma
 * dependência a menos para auditar, e os números somem junto com o processo, que é o
 * que o Prometheus espera (ele detecta o reset do contador pelo `uptime`).
 */
export class MetricsRegistry {
  private readonly requests = new Map<string, number>()
  private readonly durations = new Map<string, Histogram>()

  observe(method: string, route: string, statusCode: number, seconds: number): void {
    const requestKey = labels({ method, route, status: String(statusCode) })
    this.requests.set(requestKey, (this.requests.get(requestKey) ?? 0) + 1)

    const durationKey = JSON.stringify([method, route])
    let histogram = this.durations.get(durationKey)
    if (!histogram) {
      histogram = { buckets: DURATION_BUCKETS.map(() => 0), count: 0, sum: 0 }
      this.durations.set(durationKey, histogram)
    }
    const index = DURATION_BUCKETS.findIndex((bound) => seconds <= bound)
    if (index >= 0) histogram.buckets[index] = (histogram.buckets[index] ?? 0) + 1
    histogram.count += 1
    histogram.sum += seconds
  }

  /** Exposição no formato de texto 0.0.4; `gauges` são lidos na hora do scrape. */
  render(gauges: Array<{ name: string; help: string; value: number }>): string {
    const lines: string[] = []

    lines.push('# HELP finboard_http_requests_total Requisições HTTP respondidas.')
    lines.push('# TYPE finboard_http_requests_total counter')
    for (const [key, count] of this.requests) {
      lines.push(`finboard_http_requests_total${key} ${count}`)
    }

    lines.push('# HELP finboard_http_request_duration_seconds Latência das respostas HTTP.')
    lines.push('# TYPE finboard_http_request_duration_seconds histogram')
    for (const [key, histogram] of this.durations) {
      const [method, route] = JSON.parse(key) as [string, string]
      let cumulative = 0
      DURATION_BUCKETS.forEach((bound, i) => {
        cumulative += histogram.buckets[i] ?? 0
        const le = labels({ method, route, le: String(bound) })
        lines.push(`finboard_http_request_duration_seconds_bucket${le} ${cumulative}`)
      })
      const inf = labels({ method, route, le: '+Inf' })
      const base = labels({ method, route })
      lines.push(`finboard_http_request_duration_seconds_bucket${inf} ${histogram.count}`)
      lines.push(`finboard_http_request_duration_seconds_sum${base} ${histogram.sum}`)
      lines.push(`finboard_http_request_duration_seconds_count${base} ${histogram.count}`)
    }

    for (const gauge of gauges) {
      lines.push(`# HELP ${gauge.name} ${gauge.help}`)
      lines.push(`# TYPE ${gauge.name} gauge`)
      lines.push(`${gauge.name} ${gauge.value}`)
    }

    return `${lines.join('\n')}\n`
  }
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/**
 * Compara o `Authorization` com o token esperado em tempo constante. O hash antes do
 * `timingSafeEqual` iguala os tamanhos — senão o tamanho do token vazaria pelo tempo.
 */
export function bearerMatches(header: string | undefined, token: string): boolean {
  if (typeof header !== 'string') return false
  return timingSafeEqual(sha256(header), sha256(`Bearer ${token}`))
}

export interface MetricsRouteOptions {
  /** Com token, `/metrics` exige `Authorization: Bearer <token>`; sem, fica aberta. */
  token?: string
  /** `1` se o banco responde agora, `0` se não — vira o gauge `finboard_db_up`. */
  databaseUp: () => boolean
  schema?: FastifySchema
}

/**
 * Conta toda resposta no `onResponse` (status final, inclusive 4xx/5xx e 429 do rate
 * limit). A rota entra como o molde registrado (`/api/transactions/:id`), não como a
 * URL — um id por série deixaria o Prometheus sem memória em uma semana.
 */
export function registerMetricsHook(app: FastifyInstance): MetricsRegistry {
  const registry = new MetricsRegistry()
  app.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions.url ?? UNMATCHED_ROUTE
    registry.observe(request.method, route, reply.statusCode, reply.elapsedTime / 1000)
    done()
  })
  return registry
}

/** `GET /metrics`; separada do hook para entrar depois do swagger e aparecer no OpenAPI. */
export function registerMetricsRoute(
  app: FastifyInstance,
  registry: MetricsRegistry,
  options: MetricsRouteOptions,
): void {
  // Fora do rate limit: o Prometheus raspa do mesmo IP a cada poucos segundos, e um
  // 429 no scrape apagaria justo a série que mostra o pico de tráfego.
  const config = { rateLimit: false }
  app.get('/metrics', { schema: options.schema, config }, async (request, reply) => {
    if (options.token && !bearerMatches(request.headers.authorization, options.token)) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
    const memory = process.memoryUsage()
    reply
      .header('cache-control', 'no-store')
      .type(PROMETHEUS_CONTENT_TYPE)
      .send(
        registry.render([
          {
            name: 'finboard_db_up',
            help: 'Banco SQLite respondendo (1) ou não (0).',
            value: options.databaseUp() ? 1 : 0,
          },
          {
            name: 'finboard_process_uptime_seconds',
            help: 'Segundos desde a subida do processo.',
            value: Math.round(process.uptime()),
          },
          {
            name: 'finboard_process_resident_memory_bytes',
            help: 'Memória residente do processo.',
            value: memory.rss,
          },
          {
            name: 'finboard_nodejs_heap_used_bytes',
            help: 'Heap do V8 em uso.',
            value: memory.heapUsed,
          },
        ]),
      )
    return reply
  })
}
