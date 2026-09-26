# syntax=docker/dockerfile:1

# Uma imagem por serviço, a partir do mesmo build do monorepo:
#   docker build --target api -t finboard-api .
#   docker build --target web -t finboard-web .

# ---- deps: instala o workspace inteiro (inclui devDependencies para compilar) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

# ---- build: compila API (tsc) e SPA (vite) ----
FROM deps AS build
COPY tsconfig.base.json ./
COPY server server
COPY web web
RUN npm run build --workspace @finboard/server \
 && npm run build --workspace @finboard/web

# ---- prod-deps: só as dependências de runtime da API ----
# better-sqlite3 e argon2 são nativos: instalados na mesma base do runtime,
# os binários pré-compilados batem com a libc da imagem final.
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace @finboard/server

# ---- api: runtime enxuto, sem código-fonte nem ferramentas de build ----
FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/finboard.db
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server/dist/server.js"]

# ---- web: SPA estática no nginx, que também faz proxy de /api para a API ----
FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
