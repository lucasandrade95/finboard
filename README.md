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
│   │   ├── docs/openapi.ts           # @fastify/swagger + UI em /docs
│   │   ├── docs/schemas.ts           # descrição das rotas (OpenAPI), sem validar nada
│   │   └── modules/                  # auth, transactions, budgets, goals — rotas → repositório, schemas Zod
│   └── test/                         # Vitest + app.inject (sem rede)
└── web/      # SPA — React 19 + Vite
    └── src/
        ├── lib/api.ts                # client tipado + formatBRL/parseReaisToCents
        ├── lib/auth.ts               # store do token (memória + localStorage + listeners)
        ├── lib/theme.ts              # store do tema (system/light/dark, data-theme no <html>)
        ├── lib/donut.ts              # geometria do donut SVG (pura, testável sem render)
        ├── lib/balance-line.ts       # geometria da linha de saldo (pura, testável sem render)
        ├── hooks/use-auth.ts         # token atual via useSyncExternalStore
        ├── hooks/use-theme.ts        # tema em uso via useSyncExternalStore
        ├── hooks/use-finance.ts      # TanStack Query (cache por mês)
        └── components/               # AuthScreen, ThemeToggle, SummaryCards, BalanceLineChart, CategoryDonut, BudgetPanel, TransactionForm, TransactionList, Export/ImportCsvButton
```

Decisões:

- **Dinheiro em centavos (inteiro)** — nunca float. Formatação BRL só na borda (UI).
- **`buildApp()` separado do `listen`** — testes usam `app.inject()` com banco `:memory:`, zero rede.
- **Validação Zod na borda** — handler faz `schema.parse`; error handler central converte `ZodError` em 400 com detalhes por campo.
- **Migrações versionadas no boot** — cada passo tem id fixo e é registrado em `schema_migrations`; roda uma vez só, dentro de uma transação (falhou, nada entra). Bancos antigos, sem a tabela de controle, são adotados na primeira subida porque os passos continuam idempotentes.
- **Auth com argon2id + JWT stateless** — senha só existe como hash argon2id; login devolve JWT HS256 (7 dias) e rotas protegidas usam o preHandler `authenticate`. Senha errada e e-mail inexistente respondem o mesmo 401, com o mesmo custo de hash.
- **Tudo escopado por usuário** — transações, orçamentos e metas: o `user_id` entra no `WHERE` de toda consulta do repositório, inclusive nas de escrita, e id de outra conta responde 404 (e não 403, que confirmaria a existência). Em orçamento a chave é o par `(user_id, category)`, então duas contas podem ter teto para "mercado" sem uma sobrescrever a outra. O token guardado no SPA é o que libera as rotas; 401 derruba a sessão e devolve a tela de login.
- **Cabeçalhos de segurança e rate limit por IP** — helmet é o primeiro plugin registrado, então `nosniff`, anti-clickjacking e HSTS valem inclusive nas respostas de erro; o CORP fica em `cross-origin` porque a API é consumida de outra origem. O rate limit tem dois níveis: teto global folgado (300/min por IP — uma tela do dashboard já dispara meia dúzia de chamadas) e teto apertado em registro e login (10/min por rota), que é onde força bruta bate. Cada rota conta no próprio balde, e o 429 sai no formato de erro do resto da API (`{ error: 'rate_limit_exceeded' }`) com `retry-after`.

- **Tema em variáveis CSS, preferência em três estados** — o `styles.css` guarda só tokens (`--bg`, `--surface`, `--text`…); o tema escuro troca os valores, nenhuma regra de componente repete cor crua. A preferência persistida é `system` (padrão), `light` ou `dark` — nunca o tema já resolvido, senão entrar uma vez com o SO no escuro congelaria a página no escuro para sempre. Com `system`, o `prefers-color-scheme` manda e continua mandando se o SO virar com a página aberta. O CSS reage sozinho (media query) e o JS só escreve `data-theme` no `<html>` quando a escolha é explícita: como o CSS chega antes do JS rodar, quem usa o SO no escuro não vê o flash branco na carga.

- **OpenAPI gerado das rotas, validação continua no Zod** — cada rota declara um `schema` que só descreve a operação (tags, resumo, corpo, respostas, `bearerAuth`); o `@fastify/swagger` monta o documento a partir disso e a UI fica em `/docs`. Para o JSON Schema não virar um segundo validador — recusando requisição com outro formato de erro e recortando campos da resposta —, o `buildApp` registra um `validatorCompiler` e um `serializerCompiler` neutros: quem valida é o Zod no handler, com o 400 detalhado por campo.

## Rodando

```bash
npm install
JWT_SECRET=... npm run dev:server   # API em http://localhost:3000 (sem JWT_SECRET usa segredo de dev; em produção é obrigatório)
npm run dev:web      # SPA em http://localhost:5173 (proxy /api → 3000)
npm run verify       # lint + format + testes + build (mesmo gate do CI)
```

## API

Fora `/health` e `/api/auth/register|login`, toda rota exige `Authorization: Bearer <token>` e responde só com os dados da conta do token (401 sem token válido). Qualquer rota responde 429 `rate_limit_exceeded` quando o IP passa do teto da janela de 1 minuto — 300 requisições no geral, 10 em registro e em login.

Documentação interativa em [`/docs`](http://localhost:3000/docs) (documento OpenAPI cru em `/docs/json`): dá para autenticar com o token do login e disparar as chamadas pela própria página.

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
- [x] Multiusuário: escopo de transações por usuário
- [x] Multiusuário: escopo de orçamentos e metas por usuário
- [x] Rate limiting (@fastify/rate-limit) e helmet
- [x] OpenAPI via @fastify/swagger + UI
- [x] Dark mode (prefers-color-scheme + toggle persistido)
- [x] Skeleton loaders no lugar de "Carregando…"
- [x] Testes de componente para TransactionForm (fluxo de erro incluído)
- [x] Testes de componente para TransactionList
- [ ] MSW nos testes do front (mock da API por request)
- [ ] E2E com Playwright (fluxo criar → listar → resumo)
- [ ] Docker: Dockerfile multi-stage + docker-compose
- [ ] Seed script com dados realistas de demonstração
- [ ] CI: job de typecheck dos testes do server (tsc --noEmit incluindo test/)
- [ ] Acessibilidade: navegação por teclado + aria-labels auditados
- [ ] i18n preparada (strings centralizadas, pt-BR default)
- [ ] Categorias como entidade (tabela categories: nome, cor, ícone) + CRUD e select no formulário
- [ ] Contas/carteiras (tabela accounts) e saldo por conta no summary
- [ ] Transferência entre contas (par de lançamentos vinculados, fora de receita/despesa)
- [ ] Tags livres nas transações (N:N) + filtro por tag
- [ ] Compras parceladas (parcelamento gera N transações futuras vinculadas)
- [ ] Projeção de saldo dos próximos 30 dias (recorrentes + parcelas)
- [ ] Gráfico anual receitas × despesas por mês (barras SVG)
- [ ] Filtro por período customizado (data inicial/final) na listagem e nos gráficos
- [ ] Ordenação da tabela por coluna (data, valor, categoria) com indicador visual
- [ ] Atalhos de teclado (n = nova transação, / = busca, ? = ajuda)
- [ ] Anexo de comprovante na transação (upload local, limite de tamanho, preview)
- [ ] Relatório mensal em PDF (resumo, gráficos, top categorias)
- [ ] Auditoria: histórico de alterações por transação (quem, quando, o quê)
- [ ] Refresh token com rotação + logout de todos os dispositivos
- [ ] Recuperação de senha por e-mail (token expirável, template pt-BR)
- [ ] Exportar todos os meus dados (JSON) e excluir conta (LGPD)
- [ ] Notificação por e-mail quando orçamento passa de 80% e 100%
- [ ] Cache HTTP com ETag/If-None-Match nos endpoints de leitura
- [ ] Logs estruturados (pino) com request id propagado até o repositório
- [ ] Healthcheck `/health` e métricas `/metrics` (Prometheus)
- [ ] Teste de carga com autocannon e baseline documentado no README
- [ ] PWA: manifest + service worker com leitura offline do último resumo
- [ ] Storybook dos componentes de UI com estados (loading, vazio, erro)
- [ ] CI: publicar imagem Docker no GHCR a cada merge na main

## Progresso

Histórico diário em [PROGRESS.md](PROGRESS.md).
