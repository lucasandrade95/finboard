import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Toda rota de dados exige token, então quase todo teste começa cadastrando
    // uma conta — e o argon2 é caro de propósito (é isso que protege a senha).
    // Com os arquivos rodando em paralelo, um hash pode passar dos 5s padrão sem
    // que nada esteja travado: o limite acompanha o custo real do hash.
    testTimeout: 30_000,
  },
})
