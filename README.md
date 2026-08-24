# Finboard

Dashboard de finanças pessoais full-stack. Projeto de portfólio de Lucas Andrade.

**Stack:** Node.js 22 · Fastify 5 · TypeScript (strict) · SQLite (better-sqlite3) · Zod · React 19 · Vite · TanStack Query · Vitest · ESLint 9 (flat) · Prettier · GitHub Actions

## Arquitetura

Monorepo com npm workspaces:

```
finboard/
├── server/   # API REST — Fastify + TypeScript ESM
│   ├── src/
│   │   ├── app.ts                    # buildApp(): instância Fastify testável (injeta dbPath)
│   │   ├── server.ts                 # entrypoint (listen)
│   │   ├── config.ts                 # config via env (PORT, DB_PATH)
│   │   ├── db/connection.ts          # abre SQLite + migração idempotente
│   │   └── modules/transactions/     # rotas → repositório, schemas Zod
│   └── test/                         # Vitest + app.inject (sem rede)
└── web/      # SPA — React 19 + Vite
    └── src/
        ├── lib/api.ts                # client tipado + formatBRL/parseReaisToCents
        ├── hooks/use-finance.ts      # TanStack Query (cache por mês)
        └── components/               # SummaryCards, TransactionForm, TransactionList
```

Decisões:

- **Dinheiro em centavos (inteiro)** — nunca float. Formatação BRL só na borda (UI).
- **`buildApp()` separado do `listen`** — testes usam `app.inject()` com banco `:memory:`, zero rede.
- **Validação Zod na borda** — handler faz `schema.parse`; error handler central converte `ZodError` em 400 com detalhes por campo.
- **Migração idempotente no boot** — `CREATE TABLE IF NOT EXISTS`; trocar por migrações versionadas quando o schema crescer (item do roadmap).

## Rodando

```bash
npm install
npm run dev:server   # API em http://localhost:3000
npm run dev:web      # SPA em http://localhost:5173 (proxy /api → 3000)
npm run verify       # lint + format + testes + build (mesmo gate do CI)
```

## API

| Método | Rota                       | Descrição                                                                                        |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------ |
| GET    | `/health`                  | Health check                                                                                     |
| GET    | `/api/transactions?month=` | Lista paginada (`limit`/`offset`, filtro `category=`, devolve `{ items, total, limit, offset }`) |
| POST   | `/api/transactions`        | Cria transação (`amountCents` inteiro > 0)                                                       |
| PUT    | `/api/transactions/:id`    | Atualiza transação (200; 404 se não existe)                                                      |
| DELETE | `/api/transactions/:id`    | Exclui transação (204; 404 se não existe)                                                        |
| GET    | `/api/summary?month=`      | Receitas, despesas e saldo do período                                                            |

## Roadmap

Uma fatia por dia, sempre com teste e build verde.

- [x] DELETE `/api/transactions/:id` + botão de excluir na lista
- [x] PUT `/api/transactions/:id` (edição) + formulário de edição inline
- [x] Paginação na listagem (`limit`/`offset` + total) e na tabela
- [x] Filtro por categoria (query param + select na UI)
- [ ] Filtro por tipo (receita/despesa) na UI
- [ ] Busca textual por descrição (`q=`)
- [ ] Endpoint `/api/categories` (distintas usadas) + datalist no formulário
- [ ] Gráfico de despesas por categoria (donut SVG próprio, sem lib)
- [ ] Gráfico de evolução diária do saldo no mês (linha SVG)
- [ ] Comparativo mês atual × mês anterior no summary
- [ ] Transações recorrentes (flag + geração automática no boot)
- [ ] Orçamento mensal por categoria + barra de progresso na UI
- [ ] Alerta visual quando orçamento estoura (>100%)
- [ ] Metas de economia (tabela goals + CRUD + card na UI)
- [ ] Export CSV das transações do mês
- [ ] Import CSV (upload + validação linha a linha + relatório de erros)
- [ ] Migrações versionadas (tabela schema_migrations + runner próprio)
- [ ] Autenticação: registro/login com JWT (argon2)
- [ ] Multiusuário: escopo de transações por usuário
- [ ] Rate limiting (@fastify/rate-limit) e helmet
- [ ] OpenAPI via @fastify/swagger + UI
- [ ] Dark mode (prefers-color-scheme + toggle persistido)
- [ ] Skeleton loaders no lugar de "Carregando…"
- [ ] Testes de componente para TransactionForm (fluxo de erro incluído)
- [ ] Testes de componente para TransactionList
- [ ] MSW nos testes do front (mock da API por request)
- [ ] E2E com Playwright (fluxo criar → listar → resumo)
- [ ] Docker: Dockerfile multi-stage + docker-compose
- [ ] Seed script com dados realistas de demonstração
- [ ] CI: job de typecheck dos testes do server (tsc --noEmit incluindo test/)
- [ ] Acessibilidade: navegação por teclado + aria-labels auditados
- [ ] i18n preparada (strings centralizadas, pt-BR default)

## Progresso

Histórico diário em [PROGRESS.md](PROGRESS.md).
