import { buildApp } from './app.js'
import { loadConfig } from './config.js'

const config = loadConfig()
const app = await buildApp({
  dbPath: config.dbPath,
  jwtSecret: config.jwtSecret,
  trustProxy: config.trustProxy,
  logger: true,
})

// `docker stop` manda SIGTERM. Como PID 1 no container o Node não tem handler
// padrão e seria morto com SIGKILL após o timeout; fechando o app, as requisições
// em curso terminam e o onClose fecha o SQLite (checkpoint do WAL).
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'encerrando')
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error(error)
        process.exit(1)
      },
    )
  })
}

try {
  await app.listen({ port: config.port, host: '0.0.0.0' })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
