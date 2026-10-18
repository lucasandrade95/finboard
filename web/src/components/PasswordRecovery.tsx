import { useState, type FormEvent } from 'react'
import { t } from '../i18n'
import { api } from '../lib/api'
import { setToken } from '../lib/auth'

/**
 * Pedido do link de recuperação. A confirmação é a mesma exista a conta ou não —
 * o server também responde igual —, para a tela não virar um "este e-mail tem conta?".
 */
export function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      await api.requestPasswordReset(email)
      setSentTo(email.trim())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.passwordReset.genericError)
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="auth-card" onSubmit={(event) => void handleSubmit(event)}>
      <h1>{t.common.appName}</h1>
      <h2>{t.passwordReset.forgotTitle}</h2>
      {sentTo ? (
        <p role="status">{t.passwordReset.forgotSent(sentTo)}</p>
      ) : (
        <>
          <p className="auth-hint">{t.passwordReset.forgotHint}</p>
          <label>
            {t.auth.email}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={pending}>
            {pending ? t.passwordReset.forgotPending : t.passwordReset.forgotSubmit}
          </button>
        </>
      )}
      <button type="button" className="auth-toggle" onClick={onBack}>
        {t.passwordReset.backToLogin}
      </button>
    </form>
  )
}

/**
 * Tela aberta pelo link do e-mail. Trocar a senha não abre sessão: o usuário volta
 * ao login e entra com a senha nova, o que confirma que ele a sabe digitar.
 */
export function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Conferência só no cliente: o server recebe uma senha, a digitação dupla é UX.
    if (password !== confirmation) {
      setError(t.passwordReset.mismatch)
      return
    }
    setError(null)
    setPending(true)
    try {
      await api.resetPassword(token, password)
      // O server encerrou todas as sessões; se esta aba tinha uma, ela acaba aqui também.
      setToken(null)
      setDone(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.passwordReset.genericError)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={(event) => void handleSubmit(event)}>
        <h1>{t.common.appName}</h1>
        <h2>{t.passwordReset.resetTitle}</h2>
        {done ? (
          <p role="status">{t.passwordReset.resetDone}</p>
        ) : (
          <>
            <label>
              {t.passwordReset.newPassword}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
            </label>
            <label>
              {t.passwordReset.confirmPassword}
              <input
                type="password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={pending}>
              {pending ? t.passwordReset.resetPending : t.passwordReset.resetSubmit}
            </button>
          </>
        )}
        <button type="button" className="auth-toggle" onClick={onDone}>
          {t.passwordReset.backToLogin}
        </button>
      </form>
    </div>
  )
}
