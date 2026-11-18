import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { BRAND } from '../lib/brand'
import { messageOf } from '../lib/errors'
import { useAuth } from '../lib/auth'

/**
 * The session cookie proves who you are. The password unwraps the data key
 * when it is not already in local storage, for example on a new device.
 */
export function Unlock() {
  const { user, unlock, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await unlock(password)
      setPassword('')
    } catch (problem) {
      setError(messageOf(problem, 'Could not unlock.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-panel">
        <Avatar className="auth-avatar" size={64} seed={user?.id ?? BRAND} />

        <h1 className="auth-handle">{BRAND}</h1>
        <p className="auth-tagline">Locked. Enter your password to open the log.</p>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="auth-field">
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              autoFocus
              aria-label="Password"
              placeholder="password"
              onChange={(event) => {
                setPassword(event.target.value)
                setError('')
              }}
            />
          </div>

          <button className="primary auth-submit" type="submit" disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : null}
            Unlock
          </button>
        </form>

        {error && <p className="field-error auth-error">{error}</p>}

        <div className="auth-links">
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
