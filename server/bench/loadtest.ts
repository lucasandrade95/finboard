import { cpus } from 'node:os'
import { runLoadTest, startTarget } from './runner.js'
import { parseLoadOptions, renderTable } from './scenarios.js'

// Data local, não UTC: mesmo relógio do seed e do boot.
function localToday(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const options = parseLoadOptions(process.argv.slice(2))
const target = await startTarget(localToday())
try {
  console.error(
    `Carga: ${options.connections} conexões, ${options.duration}s por cenário, ` +
      `Node ${process.version}, ${cpus()[0]?.model ?? 'CPU desconhecida'} (${cpus().length} núcleos)`,
  )
  const rows = await runLoadTest(target, options)
  console.log(renderTable(rows))

  // Status fora do esperado invalida a medição: req/s de 401 ou 500 não é baseline.
  const failed = rows.filter((row) => row.unexpected > 0)
  if (failed.length > 0) {
    console.error(`Respostas fora do esperado em: ${failed.map((row) => row.name).join(', ')}`)
    process.exitCode = 1
  }
} finally {
  await target.close()
}
