import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { setToken } from '../lib/auth'

type Mode = 'login' | 'register'

const COPY: Record<Mode, { title: string; submit: string; pending: string; toggle: string }> = {
  login: {
    title: 'Entrar',
    submit: 'Entrar',
    pending: 'Entrando…',
    toggle: 'Não tem conta? Criar uma',
  },
  register: {
    title: 'Criar conta',
    submit: 'Criar conta',
    pending: 'Criando…',
    toggle: 'Já tem conta? Entrar',
  },
}

/**
 * Porta de entrada do app: sem token nenhuma rota de transação responde, então a
 * tela é exclusiva (não é um modal por cima do dashboard). Registro e login
 * dividem o mesmo formulário porque os campos são os mesmos e a API devolve o
 * token nos dois casos — quem acabou de criar a conta já entra.
 */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const copy = COPY[mode]

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      const session = await (mode === 'login'
        ? api.login(email, password)
        : api.register(email, password))
      // O token no store já derruba esta tela: o App observa a mesma fonte.
      setToken(session.token)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.')
      setPending(false)
    }
  }

  function switchMode() {
    setMode(mode === 'login' ? 'register' : 'login')
    setError(null)
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={(event) => void handleSubmit(event)}>
        <h1>Finboard</h1>
        <h2>{copy.title}</h2>
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={8}
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? copy.pending : copy.submit}
        </button>
        <button type="button" className="auth-toggle" onClick={switchMode}>
          {copy.toggle}
        </button>
      </form>
    </div>
  )
}
