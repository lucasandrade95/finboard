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
│   │   ├── config.ts                 # config via env (PORT, DB_PATH, JWT_SECRET)
│   │   ├── db/connection.ts          # abre SQLite + roda o runner de migrações
│   │   ├── db/migrations.ts          # lista versionada + runner (schema_migrations)
│   │   └── modules/                  # auth, transactions, budgets, goals — rotas → repositório, schemas Zod
│   └── test/                         # Vitest + app.inject (sem rede)
└── web/      # SPA — React 19 + Vite
    └── src/
        ├── lib/api.ts                # client tipado + formatBRL/parseReaisToCents
        ├── lib/donut.ts              # geometria do donut SVG (pura, testável sem render)
        ├── lib/balance-line.ts       # geometria da linha de saldo (pura, testável sem render)
        ├── hooks/use-finance.ts      # TanStack Query (cache por mês)
        └── components/               # SummaryCards, BalanceLineChart, CategoryDonut, BudgetPanel, TransactionForm, TransactionList, ImportCsvButton
```

Decisões:

- **Dinheiro em centavos (inteiro)** — nunca float. Formatação BRL só na borda (UI).
- **`buildApp()` separado do `listen`** — testes usam `app.inject()` com banco `:memory:`, zero rede.
- **Validação Zod na borda** — handler faz `schema.parse`; error handler central converte `ZodError` em 400 com detalhes por campo.
- **Migrações versionadas no boot** — cada passo tem id fixo e é registrado em `schema_migrations`; roda uma vez só, dentro de uma transação (falhou, nada entra). Bancos antigos, sem a tabela de controle, são adotados na primeira subida porque os passos continuam idempotentes.
- **Auth com argon2id + JWT stateless** — senha só existe como hash argon2id; login devolve JWT HS256 (7 dias) e rotas protegidas usam o preHandler `authenticate`. Senha errada e e-mail inexistente respondem o mesmo 401, com o mesmo custo de hash.

## Rodando

```bash
npm install
JWT_SECRET=... npm run dev:server   # API em http://localhost:3000 (sem JWT_SECRET usa segredo de dev; em produção é obrigatório)
npm run dev:web      # SPA em http://localhost:5173 (proxy /api → 3000)
npm run verify       # lint + format + testes + build (mesmo gate do CI)
```

## API

| Método | Rota                               | Descrição                                                                                                                            |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/health`                          | Health check                                                                                                                         |
| POST   | `/api/auth/register`               | Cria conta (`email`, `password` 8–128) e devolve `{ user, token }` (201; 409 `email_taken`)                                          |
| POST   | `/api/auth/login`                  | Troca e-mail/senha por `{ user, token }` (401 `invalid_credentials`, igual para e-mail inexistente e senha errada)                   |
| GET    | `/api/auth/me`                     | Usuário do token (`Authorization: Bearer <token>`; 401 sem token ou token inválido)                                                  |
| GET    | `/api/transactions?month=`         | Lista paginada (`limit`/`offset`, filtros `type=`/`category=`, busca `q=` na descrição, devolve `{ items, total, limit, offset }`)   |
| POST   | `/api/transactions`                | Cria transação (`amountCents` inteiro > 0; `recurring` marca a série para gerar cópia mensal no boot)                                |
| PUT    | `/api/transactions/:id`            | Atualiza transação (200; 404 se não existe)                                                                                          |
| DELETE | `/api/transactions/:id`            | Exclui transação (204; 404 se não existe)                                                                                            |
| GET    | `/api/transactions/export.csv`     | Exporta as transações do mês em CSV (`month` obrigatório; `;` + vírgula decimal + BOM, abre direto no Excel pt-BR)                   |
| POST   | `/api/transactions/import`         | Importa CSV no formato do export (corpo `text/csv`; 201 `{ imported }`; tudo ou nada — 400 `invalid_csv` com erros por linha/coluna) |
| GET    | `/api/categories?month=`           | Categorias distintas usadas no período (`{ categories: string[] }`)                                                                  |
| GET    | `/api/daily-balance?month=`        | Saldo acumulado dia a dia do mês (`month` obrigatório; um ponto por dia, inclusive dias sem movimento)                               |
| GET    | `/api/summary?month=`              | Receitas, despesas e saldo do período (com `month`, inclui `previous` com o resumo do mês anterior)                                  |
| GET    | `/api/expenses-by-category?month=` | Total de despesas por categoria, maior primeiro (`{ items, totalCents }`)                                                            |
| GET    | `/api/budgets?month=`              | Orçamentos com gasto do mês por categoria (`month` obrigatório; `{ month, items: [{ category, budgetCents, spentCents }] }`)         |
| PUT    | `/api/budgets/:category`           | Define/atualiza orçamento mensal da categoria (upsert; `{ amountCents }` inteiro > 0)                                                |
| DELETE | `/api/budgets/:category`           | Remove orçamento da categoria (204; 404 se não existe)                                                                               |
| GET    | `/api/goals`                       | Metas de economia (`{ items }`), prazo mais próximo primeiro e sem prazo por último                                                  |
| POST   | `/api/goals`                       | Cria meta (`name`, `targetCents` > 0, `savedCents` ≥ 0 opcional, `deadline` YYYY-MM-DD ou null)                                      |
| PUT    | `/api/goals/:id`                   | Atualiza meta (200; 404 se não existe)                                                                                               |
| POST   | `/api/goals/:id/contributions`     | Registra aporte (`{ amountCents }` > 0) somando ao guardado no banco; devolve a meta atualizada                                      |
| DELETE | `/api/goals/:id`                   | Remove meta (204; 404 se não existe)                                                                                                 |

## Roadmap

Uma fatia por dia, sempre com teste e build verde.

- [x] DELETE `/api/transactions/:id` + botão de excluir na lista
- [x] PUT `/api/transactions/:id` (edição) + formulário de edição inline
- [x] Paginação na listagem (`limit`/`offset` + total) e na tabela
- [x] Filtro por categoria (query param + select na UI)
- [x] Filtro por tipo (receita/despesa) na UI
- [x] Busca textual por descrição (`q=`)
- [x] Endpoint `/api/categories` (distintas usadas) + datalist no formulário
- [x] Gráfico de despesas por categoria (donut SVG próprio, sem lib)
- [x] Gráfico de evolução diária do saldo no mês (linha SVG)
- [x] Comparativo mês atual × mês anterior no summary
- [x] Transações recorrentes (flag + geração automática no boot)
- [x] Orçamento mensal por categoria + barra de progresso na UI
- [x] Alerta visual quando orçamento estoura (>100%)
- [x] Metas de economia (tabela goals + CRUD + card na UI)
- [x] Export CSV das transações do mês
- [x] Import CSV (upload + validação linha a linha + relatório de erros)
- [x] Migrações versionadas (tabela schema_migrations + runner próprio)
- [x] Autenticação: registro/login com JWT (argon2)
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
