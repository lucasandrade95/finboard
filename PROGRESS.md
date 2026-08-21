# Progresso

- **2026-08-20** — Exclusão de transações: novo endpoint DELETE `/api/transactions/:id` (204 no sucesso, 404 se não existe, 400 para id inválido via Zod) e botão "Excluir" em cada linha da tabela, com confirmação antes de apagar. A mutação do TanStack Query invalida lista e resumo, então os cards atualizam sozinhos após excluir. Três testes novos no server cobrem os três status.
- **2026-08-20** — Bootstrap do projeto: monorepo npm workspaces com API Fastify/TypeScript (transações + resumo mensal, SQLite, Zod, testes com inject) e SPA React/Vite (dashboard com cards de resumo, formulário e listagem, TanStack Query). CI no GitHub Actions rodando lint, format, testes e build.
