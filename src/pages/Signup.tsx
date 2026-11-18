import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { BRAND } from '../lib/brand'
import { post } from '../lib/api'
import { readGuestSeed } from '../lib/avatar'
import { messageOf } from '../lib/errors'

type Start = { challengeId?: string; existing?: boolean; email: string }

export function Signup() {
  const navigate = useNavigate()

  const [seed] = useState(readGuestSeed)
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [masked, setMasked] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submitEmail = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await post<Start>('/api/auth/signup', { email: email.trim() })

      if (data.existing || !data.challengeId) {
        setError('That email already has an account. Sign in instead.')
        return
      }

      setChallengeId(data.challengeId)
      setMasked(data.email)
      setCode('')
      setStep('code')
    } catch (problem) {
      setError(
        messageOf(problem, 'Could not start signing up.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await post<{ token: string }>('/api/auth/signup/verify', {
        challengeId,
        code,
      })
      navigate('/signup/password', { replace: true, state: { token: data.token } })
    } catch (problem) {
      setError(messageOf(problem, 'Could not check that code.'))
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-panel">
        <Avatar className="auth-avatar" size={64} seed={seed} />

        <h1 className="auth-handle">{BRAND}</h1>
        <p className="auth-tagline">
          {step === 'email'
            ? 'Sign up to keep your links.'
            : `We sent a code to ${masked}.`}
        </p>

        {step === 'email' ? (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              void submitEmail()
            }}
          >
            <div className="auth-field">
              <input
                type="email"
                value={email}
                autoComplete="email"
                autoFocus
                aria-label="Email"
                placeholder="email"
                onChange={(event) => {
                  setEmail(event.target.value)
                  setError('')
                }}
              />
            </div>

            <button className="primary auth-submit" type="submit" disabled={busy}>
              {busy ? <Loader2 size={15} className="spin" /> : null}
              Send my code
            </button>
          </form>
        ) : (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              void submitCode()
            }}
          >
            <div className="auth-field">
              <input
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                aria-label="Sign up code"
                placeholder="6 digit code"
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  setError('')
                }}
              />
            </div>

            <button
              className="primary auth-submit"
              type="submit"
              disabled={busy || code.length !== 6}
            >
              {busy ? <Loader2 size={15} className="spin" /> : null}
              Continue
            </button>

            <button
              type="button"
              className="auth-alt"
              onClick={() => {
                setStep('email')
                setCode('')
                setChallengeId('')
                setError('')
              }}
            >
              Use another email
            </button>
          </form>
        )}

        {error && <p className="field-error auth-error">{error}</p>}

        <div className="auth-links">
          <Link to="/login">
            <ArrowLeft size={13} />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
