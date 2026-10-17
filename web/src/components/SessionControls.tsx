import { useState } from 'react'
import { t } from '../i18n'
import { api } from '../lib/api'

/**
 * "Sair" encerra só este dispositivo; "Sair de todos" revoga a sessão em todo lugar
 * (celular perdido, computador emprestado). Os dois zeram o token, e o `App` volta
 * para o login e limpa o cache sozinho.
 */
export function SessionControls() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  async function logoutEverywhere() {
    if (!window.confirm(t.session.confirmLogoutAll)) {
      return
    }
    setPending(true)
    setError(false)
    try {
      await api.logoutAll()
    } catch {
      // A sessão local continua: sem a confirmação do server, os outros dispositivos
      // ainda estão logados e o usuário precisa saber disso para tentar de novo.
      setError(true)
      setPending(false)
    }
  }

  return (
    <div className="session-controls">
      <button
        type="button"
        className="logout"
        disabled={pending}
        onClick={() => void logoutEverywhere()}
      >
        {pending ? t.session.logoutAllPending : t.session.logoutAll}
      </button>
      <button type="button" className="logout" onClick={() => void api.logout()}>
        {t.dashboard.logout}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {t.session.logoutAllError}
        </p>
      )}
    </div>
  )
}
