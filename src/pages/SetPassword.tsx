import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Check, Copy, Loader2 } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { BRAND } from '../lib/brand'
import { api, post } from '../lib/api'
import { readGuestSeed } from '../lib/avatar'
import { useAuth } from '../lib/auth'
import { messageOf } from '../lib/errors'
import {
  adoptDataKey,
  DEFAULT_ITERATIONS,
  deriveAuthKey,
  deriveKek,
  generateDataKey,
  generateRecoveryCode,
  generateSalt,
  normalizeRecoveryCode,
  recoveryHash,
  toBase64,
  wrapDataKey,
} from '../lib/crypto'

export function SetPassword() {
  const { refresh } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const token =
    (location.state as { token?: string } | null)?.token ??
    new URLSearchParams(location.search).get('token') ??
    ''

  const [seed] = useState(readGuestSeed)
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recovery, setRecovery] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true

    api<{ email: string }>(
      `/api/auth/signup/lookup?token=${encodeURIComponent(token)}`,
    )
      .then((data) => {
        if (!alive) return
        setEmail(data.email)
        setState('ready')
      })
      .catch((problem: unknown) => {
        if (!alive) return
        setError(
          messageOf(problem, 'That sign up expired. Start again.'),
        )
        setState('error')
      })

    return () => {
      alive = false
    }
  }, [token])

  const submit = async () => {
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const authSalt = generateSalt()
      const authKey = await deriveAuthKey(password, authSalt)

      const kdfSalt = generateSalt()
      const kek = await deriveKek(password, kdfSalt)
      const raw = generateDataKey()
      const wrappedKey = await wrapDataKey(kek, raw)

      const code = generateRecoveryCode()
      const recoverySalt = generateSalt()
      const recoveryKek = await deriveKek(
        normalizeRecoveryCode(code),
        recoverySalt,
      )
      const recoveryWrappedKey = await wrapDataKey(recoveryKek, raw)

      await post('/api/auth/signup/complete', {
        token,
        authSalt,
        authKey,
        authIterations: DEFAULT_ITERATIONS,
        kdfSalt,
        kdfIterations: DEFAULT_ITERATIONS,
        wrappedKey,
        recoverySalt,
        recoveryIterations: DEFAULT_ITERATIONS,
        recoveryWrappedKey,
        recoveryHash: await recoveryHash(code),
      })

      await adoptDataKey(toBase64(raw))
      setPassword('')
      setConfirm('')
      setRecovery(code)
    } catch (problem) {
      setError(
        messageOf(problem, 'Could not save your password.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recovery)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const finish = async () => {
    await refresh()
    navigate('/log', { replace: true })
  }

  return (
    <div className="auth">
      <div className="auth-panel">
        <Avatar className="auth-avatar" size={64} seed={seed} />

        <h1 className="auth-handle">{BRAND}</h1>

        {recovery ? (
          <>
            <p className="auth-tagline">Save your recovery code.</p>
            <p className="auth-note">
              This is the only way back into your log if you forget your
              password. It is shown once and cannot be recovered later.
            </p>

            <code className="recovery-code">{recovery}</code>

            <button type="button" className="ghost auth-copy" onClick={() => void copy()}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy code'}
            </button>

            <button
              type="button"
              className="primary auth-submit"
              onClick={() => void finish()}
            >
              Continue to my log
            </button>
          </>
        ) : (
          <>
            <p className="auth-tagline">
              {state === 'loading'
                ? 'Checking your code...'
                : state === 'error'
                  ? 'That code did not work.'
                  : `Set a password for ${email}.`}
            </p>

            {state === 'ready' && (
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
                    autoComplete="new-password"
                    autoFocus
                    aria-label="Password"
                    placeholder="password"
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setError('')
                    }}
                  />
                </div>
                <div className="auth-field">
                  <input
                    type="password"
                    value={confirm}
                    autoComplete="new-password"
                    aria-label="Confirm password"
                    placeholder="confirm password"
                    onChange={(event) => {
                      setConfirm(event.target.value)
                      setError('')
                    }}
                  />
                </div>

                <button
                  className="primary auth-submit"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? <Loader2 size={15} className="spin" /> : null}
                  Create my log
                </button>
              </form>
            )}

            {state === 'loading' && <span className="spin-ring" />}

            {error && <p className="field-error auth-error">{error}</p>}

            {state === 'error' && (
              <div className="auth-links">
                <Link to="/signup">Start again</Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
