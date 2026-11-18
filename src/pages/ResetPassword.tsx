import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
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
  unwrapDataKey,
  wrapDataKey,
} from '../lib/crypto'

type Lookup = {
  email: string
  recoverySalt: string
  recoveryIterations: number
  recoveryWrappedKey: string
}

export function ResetPassword() {
  const { refresh } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const token =
    (location.state as { token?: string } | null)?.token ??
    new URLSearchParams(location.search).get('token') ??
    ''

  const [seed] = useState(readGuestSeed)
  const [email, setEmail] = useState('')
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'wiped'>(
    'loading',
  )
  const [mode, setMode] = useState<'recover' | 'wipe'>('recover')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [newCode, setNewCode] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true

    api<Lookup>(`/api/auth/recover/lookup?token=${encodeURIComponent(token)}`)
      .then((data) => {
        if (!alive) return
        setLookup(data)
        setEmail(data.email)
        setState('ready')
      })
      .catch((problem: unknown) => {
        if (!alive) return
        setError(
          messageOf(problem, 'That reset expired. Start again.'),
        )
        setState('error')
      })

    return () => {
      alive = false
    }
  }, [token])

  const finish = async () => {
    await refresh()
    navigate('/log', { replace: true })
  }

  const submitRecovery = async () => {
    if (!lookup) return
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
      const oldKek = await deriveKek(
        normalizeRecoveryCode(recoveryCode),
        lookup.recoverySalt,
        lookup.recoveryIterations,
      )

      let raw: Uint8Array<ArrayBuffer>
      try {
        raw = await unwrapDataKey(oldKek, lookup.recoveryWrappedKey)
      } catch {
        throw new Error('That recovery code is wrong.')
      }

      const kdfSalt = generateSalt()
      const kek = await deriveKek(password, kdfSalt)
      const wrappedKey = await wrapDataKey(kek, raw)

      const authSalt = generateSalt()
      const authKey = await deriveAuthKey(password, authSalt)

      await post('/api/auth/recover/complete', {
        token,
        recoveryKey: await recoveryHash(recoveryCode),
        authSalt,
        authKey,
        authIterations: DEFAULT_ITERATIONS,
        kdfSalt,
        kdfIterations: DEFAULT_ITERATIONS,
        wrappedKey,
      })

      await adoptDataKey(toBase64(raw))
      setPassword('')
      setConfirm('')
      await finish()
    } catch (problem) {
      setError(
        messageOf(problem, 'Could not reset the password.'),
      )
      setBusy(false)
    }
  }

  const submitWipe = async () => {
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
      const kdfSalt = generateSalt()
      const kek = await deriveKek(password, kdfSalt)
      const raw = generateDataKey()
      const wrappedKey = await wrapDataKey(kek, raw)

      const authSalt = generateSalt()
      const authKey = await deriveAuthKey(password, authSalt)

      const code = generateRecoveryCode()
      const recoverySalt = generateSalt()
      const codeKek = await deriveKek(normalizeRecoveryCode(code), recoverySalt)
      const recoveryWrappedKey = await wrapDataKey(codeKek, raw)

      await post('/api/auth/recover/wipe', {
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
      setNewCode(code)
      setState('wiped')
    } catch (problem) {
      setError(
        messageOf(problem, 'Could not reset the account.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(newCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  if (state === 'wiped') {
    return (
      <div className="auth">
        <div className="auth-panel">
          <Avatar className="auth-avatar" size={64} seed={seed} />
          <h1 className="auth-handle">{BRAND}</h1>
          <p className="auth-tagline">Save your new recovery code.</p>
          <p className="auth-note">
            The old links were deleted and cannot be brought back. This code is
            shown once.
          </p>

          <code className="recovery-code">{newCode}</code>

          <button
            type="button"
            className="ghost auth-copy"
            onClick={() => void copy()}
          >
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
        </div>
      </div>
    )
  }

  return (
    <div className="auth">
      <div className="auth-panel">
        <Avatar className="auth-avatar" size={64} seed={seed} />

        <h1 className="auth-handle">{BRAND}</h1>
        <p className="auth-tagline">
          {state === 'loading'
            ? 'Checking your code...'
            : state === 'error'
              ? 'That code did not work.'
              : mode === 'recover'
                ? `Reset the password for ${email}.`
                : 'Start over without a recovery code.'}
        </p>

        {state === 'ready' && mode === 'recover' && (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              void submitRecovery()
            }}
          >
            <div className="auth-field">
              <input
                value={recoveryCode}
                autoComplete="off"
                autoFocus
                aria-label="Recovery code"
                placeholder="recovery code"
                onChange={(event) => {
                  setRecoveryCode(event.target.value)
                  setError('')
                }}
              />
            </div>
            <div className="auth-field">
              <input
                type="password"
                value={password}
                autoComplete="new-password"
                aria-label="New password"
                placeholder="new password"
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
                aria-label="Confirm new password"
                placeholder="confirm new password"
                onChange={(event) => {
                  setConfirm(event.target.value)
                  setError('')
                }}
              />
            </div>

            <button className="primary auth-submit" type="submit" disabled={busy}>
              {busy ? <Loader2 size={15} className="spin" /> : null}
              Save the new password
            </button>

            <button
              type="button"
              className="auth-alt"
              onClick={() => {
                setMode('wipe')
                setError('')
              }}
            >
              I lost my recovery code
            </button>
          </form>
        )}

        {state === 'ready' && mode === 'wipe' && (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              void submitWipe()
            }}
          >
            <p className="auth-note danger">
              Without the recovery code the links cannot be decrypted. This
              deletes them and starts an empty log.
            </p>

            <div className="auth-field">
              <input
                type="password"
                value={password}
                autoComplete="new-password"
                autoFocus
                aria-label="New password"
                placeholder="new password"
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
                aria-label="Confirm new password"
                placeholder="confirm new password"
                onChange={(event) => {
                  setConfirm(event.target.value)
                  setError('')
                }}
              />
            </div>

            <button className="primary auth-submit" type="submit" disabled={busy}>
              {busy ? <Loader2 size={15} className="spin" /> : null}
              Delete my links and start over
            </button>

            <button
              type="button"
              className="auth-alt"
              onClick={() => {
                setMode('recover')
                setError('')
              }}
            >
              I have my recovery code
            </button>
          </form>
        )}

        {state === 'loading' && <span className="spin-ring" />}

        {error && <p className="field-error auth-error">{error}</p>}
      </div>
    </div>
  )
}
