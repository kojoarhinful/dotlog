import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { api, post } from './api'
import {
  adoptDataKey,
  deriveAuthKey,
  deriveKek,
  forgetDataKey,
  restoreDataKey,
  toBase64,
  unwrapDataKey,
} from './crypto'

export type AuthUser = {
  id: string
  email: string
  name?: string | null
}

type AuthState = {
  user: AuthUser | null
  loading: boolean
  unlocked: boolean
  refresh: () => Promise<AuthUser | null>
  beginLogin: (
    email: string,
    password: string,
  ) => Promise<{ challengeId: string; email: string }>
  unlock: (password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [unlocked, setUnlocked] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ user: AuthUser | null }>('/api/auth/session')
      setUser(data.user)
      // A signed out or expired session must not leave a decryption key on disk
      // for whoever signs in next on this browser.
      if (!data.user) forgetDataKey()
      setUnlocked(data.user ? await restoreDataKey() : false)
      return data.user
    } catch {
      setUser(null)
      setUnlocked(false)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // A 401 from the server means the cookie expired or was revoked. Do not keep
  // the decryption key around for whoever uses this browser next.
  useEffect(() => {
    const expire = () => {
      forgetDataKey()
      setUser(null)
      setUnlocked(false)
    }
    window.addEventListener('dotlog:signed-out', expire)
    return () => window.removeEventListener('dotlog:signed-out', expire)
  }, [])

  /**
   * The password never leaves the browser. It is turned into a verifier with
   * the account's auth salt, and only that verifier is sent.
   */
  const beginLogin = useCallback(async (email: string, password: string) => {
    const address = email.trim()
    const { authSalt, authIterations } = await api<{
      authSalt: string
      authIterations: number
    }>(`/api/auth/salt?email=${encodeURIComponent(address)}`)
    const authKey = await deriveAuthKey(password, authSalt, authIterations)
    return post<{ challengeId: string; email: string }>('/api/auth/login', {
      email: address,
      authKey,
    })
  }, [])

  const unlock = useCallback(async (password: string) => {
    const keys = await api<{
      kdfSalt: string
      kdfIterations: number
      wrappedKey: string
    }>('/api/auth/key')

    try {
      const kek = await deriveKek(password, keys.kdfSalt, keys.kdfIterations)
      const raw = await unwrapDataKey(kek, keys.wrappedKey)
      await adoptDataKey(toBase64(raw))
    } catch {
      throw new Error('That password is wrong.')
    }

    setUnlocked(true)
  }, [])

  const signOut = useCallback(async () => {
    try {
      await post('/api/auth/logout', {})
    } finally {
      forgetDataKey()
      setUser(null)
      setUnlocked(false)
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, unlocked, refresh, beginLogin, unlock, signOut }),
    [beginLogin, loading, refresh, signOut, unlock, unlocked, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
