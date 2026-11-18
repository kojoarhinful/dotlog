import { Link, Navigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { BRAND } from '../lib/brand'
import { Boot } from './Login'

/** Unknown paths are a dead end, unless there is a log to fall back to. */
export function NotFound() {
  const { user, loading } = useAuth()

  if (loading) return <Boot />
  if (user) return <Navigate to="/log" replace />

  return (
    <div className="auth">
      <div className="auth-panel">
        <h1 className="auth-handle">{BRAND}</h1>
        <p className="auth-tagline">404. Nothing is logged at this path.</p>

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
