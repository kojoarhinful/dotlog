import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle, KeyRound, Loader2, RefreshCw, Trash2, X } from 'lucide-react'
import { api, patch, post } from '../lib/api'
import { useAuth } from '../lib/auth'
import { messageOf } from '../lib/errors'
import {
  adoptDataKey,
  DEFAULT_ITERATIONS,
  deriveAuthKey,
  deriveKek,
  generateSalt,
  toBase64,
  unwrapDataKey,
  wrapDataKey,
} from '../lib/crypto'
import { Avatar } from './Avatar'
import { useStore } from '../lib/store'

const SEED_KEY = 'refs:avatar:seed'

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['c'], label: 'New commit' },
  { keys: ['j', 'k'], label: 'Move between commits' },
  { keys: ['Enter'], label: 'Open the remote' },
  { keys: ['r'], label: 'Mark reviewed' },
  { keys: ['e'], label: 'Amend commit' },
  { keys: ['s'], label: 'Stash commit' },
  { keys: ['/'], label: 'Search commits' },
  { keys: ['\u2318', 'K'], label: 'Search commits' },
  { keys: ['?'], label: 'Keyboard shortcuts' },
  { keys: ['Esc'], label: 'Cancel or close' },
]

function readSeed(key: string, fallback: string): string {
  return localStorage.getItem(key) ?? fallback
}

export function Profile({ compact = false }: { compact?: boolean }) {
  const { user, refresh, signOut } = useAuth()
  const uid = user?.id ?? 'local'
  const helpOpen = useStore((s) => s.helpOpen)
  const openHelp = useStore((s) => s.openHelp)
  const closeHelp = useStore((s) => s.closeHelp)

  const [seed, setSeed] = useState(() => readSeed(`${SEED_KEY}:${uid}`, uid))
  const [editorOpen, setEditorOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState('')

  const [deleteId, setDeleteId] = useState('')
  const [deleteCode, setDeleteCode] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const name = user?.name?.trim() || user?.email || 'you'

  const openEditor = () => {
    setDraft(user?.name ?? '')
    setError('')
    setEditorOpen(true)
  }

  const shuffle = () => {
    const nextSeed = Math.random().toString(36).slice(2)
    setSeed(nextSeed)
    localStorage.setItem(`${SEED_KEY}:${uid}`, nextSeed)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await patch('/api/auth/me', { name: draft.trim() || null })
      await refresh()
      setEditorOpen(false)
    } catch (problem) {
      setError(
        messageOf(problem, 'Could not save your name.'),
      )
    } finally {
      setSaving(false)
    }
  }

  const openPassword = () => {
    setCurrent('')
    setNext('')
    setConfirm('')
    setPwError('')
    setPasswordOpen(true)
  }

  const savePassword = async () => {
    if (!current) {
      setPwError('Enter your current password.')
      return
    }
    if (next.length < 8) {
      setPwError('Use at least 8 characters.')
      return
    }
    if (next !== confirm) {
      setPwError('The two passwords do not match.')
      return
    }

    setPwBusy(true)
    setPwError('')
    try {
      const keys = await api<{
        kdfSalt: string
        kdfIterations: number
        wrappedKey: string
        authSalt: string
        authIterations: number
      }>('/api/auth/key')

      const currentKey = await deriveAuthKey(
        current,
        keys.authSalt,
        keys.authIterations,
      )

      let raw: Uint8Array<ArrayBuffer>
      try {
        const kek = await deriveKek(current, keys.kdfSalt, keys.kdfIterations)
        raw = await unwrapDataKey(kek, keys.wrappedKey)
      } catch {
        throw new Error('That password is wrong.')
      }

      const authSalt = generateSalt()
      const authKey = await deriveAuthKey(next, authSalt, DEFAULT_ITERATIONS)
      const kdfSalt = generateSalt()
      const kek = await deriveKek(next, kdfSalt, DEFAULT_ITERATIONS)
      const wrappedKey = await wrapDataKey(kek, raw)

      await post('/api/auth/password', {
        currentKey,
        authSalt,
        authKey,
        authIterations: DEFAULT_ITERATIONS,
        kdfSalt,
        kdfIterations: DEFAULT_ITERATIONS,
        wrappedKey,
      })

      await adoptDataKey(toBase64(raw))
      setPasswordOpen(false)
    } catch (problem) {
      setPwError(
        messageOf(problem, 'Could not change the password.'),
      )
    } finally {
      setPwBusy(false)
    }
  }

  const openDelete = () => {
    setDeleteId('')
    setDeleteCode('')
    setDeleteError('')
    setDeleteOpen(true)
  }

  const startDelete = async () => {
    setDeleteBusy(true)
    setDeleteError('')
    try {
      const data = await post<{ challengeId: string }>('/api/auth/delete/start', {})
      setDeleteId(data.challengeId)
      setDeleteCode('')
    } catch (problem) {
      setDeleteError(
        messageOf(problem, 'Could not send the code.'),
      )
    } finally {
      setDeleteBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (deleteCode.length !== 6) {
      setDeleteError('Enter the 6 digit code.')
      return
    }

    setDeleteBusy(true)
    setDeleteError('')
    try {
      await post('/api/auth/delete', {
        challengeId: deleteId,
        code: deleteCode,
      })
      // The session and the archive are gone, so start clean.
      window.location.assign('/log')
    } catch (problem) {
      setDeleteError(
        messageOf(problem, 'Could not delete the account.'),
      )
      setDeleteBusy(false)
    }
  }

  return (
    <>
      {compact ? (
        <button
          type="button"
          className="header-avatar"
          title="Profile"
          aria-label="Profile"
          onClick={openEditor}
        >
          <Avatar size={30} seed={seed} />
        </button>
      ) : (
        <div className="profile">
          <button className="profile-main" onClick={openEditor}>
            <span className="profile-avatar">
              <Avatar size={26} seed={seed} />
            </span>
            <span className="profile-id">
              <span className="profile-name">{name}</span>
              <span className="profile-sub">profile</span>
            </span>
          </button>
          <button
            className="profile-help"
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
            onClick={openHelp}
          >
            <HelpCircle size={14} />
          </button>
        </div>
      )}

      {editorOpen && (
        <Layer onClose={() => setEditorOpen(false)}>
          <form
            className="dialog narrow"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <header className="dialog-head">
              <div>
                <h2>Profile</h2>
                <p>{user?.email ?? 'Only stored on this device.'}</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setEditorOpen(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </header>

            <div className="profile-edit">
              <span className="profile-edit-avatar">
                <Avatar size={52} seed={seed} />
              </span>
              <button type="button" className="ghost small" onClick={shuffle}>
                <RefreshCw size={13} />
                Shuffle avatar
              </button>
            </div>

            <div className="field">
              <label htmlFor="profile-name">Display name</label>
              <input
                id="profile-name"
                value={draft}
                autoComplete="off"
                autoFocus
                placeholder={user?.email ?? 'Your name'}
                onChange={(event) => setDraft(event.target.value)}
              />
              <p className="field-hint">Leave it empty to show your email instead.</p>
            </div>

            <div className="profile-actions">
              <button
                type="button"
                className="ghost small"
                onClick={openPassword}
              >
                <KeyRound size={13} />
                Change password
              </button>
              <button
                type="button"
                className="ghost small profile-delete"
                onClick={openDelete}
              >
                <Trash2 size={13} />
                Delete account
              </button>
            </div>

            <a
              className="profile-terms"
              href="/terms"
              target="_blank"
              rel="noopener"
            >
              Terms
            </a>

            {error && <p className="field-error">{error}</p>}

            <footer className="dialog-foot profile-foot">
              <button
                type="button"
                className="ghost small profile-signout"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="primary" disabled={saving}>
                {saving ? <Loader2 size={15} className="spin" /> : null}
                Save profile
              </button>
            </footer>
          </form>
        </Layer>
      )}

      {passwordOpen && (
        <Layer onClose={() => setPasswordOpen(false)}>
          <form
            className="dialog narrow"
            onSubmit={(event) => {
              event.preventDefault()
              void savePassword()
            }}
          >
            <header className="dialog-head">
              <div>
                <h2>Change password</h2>
                <p>Your links are re-locked with the new password.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPasswordOpen(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </header>

            <div className="field">
              <label htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                type="password"
                value={current}
                autoComplete="current-password"
                autoFocus
                onChange={(event) => {
                  setCurrent(event.target.value)
                  setPwError('')
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                value={next}
                autoComplete="new-password"
                onChange={(event) => {
                  setNext(event.target.value)
                  setPwError('')
                }}
              />
              <p className="field-hint">At least 8 characters.</p>
            </div>

            <div className="field">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                autoComplete="new-password"
                onChange={(event) => {
                  setConfirm(event.target.value)
                  setPwError('')
                }}
              />
            </div>

            {pwError && <p className="field-error">{pwError}</p>}

            <footer className="dialog-foot">
              <button
                type="button"
                className="ghost"
                onClick={() => setPasswordOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="primary" disabled={pwBusy}>
                {pwBusy ? <Loader2 size={15} className="spin" /> : null}
                Save password
              </button>
            </footer>
          </form>
        </Layer>
      )}

      {deleteOpen && (
        <Layer onClose={() => setDeleteOpen(false)}>
          <form
            className="dialog narrow"
            onSubmit={(event) => {
              event.preventDefault()
              if (deleteId) void confirmDelete()
              else void startDelete()
            }}
          >
            <header className="dialog-head">
              <div>
                <h2>Delete account</h2>
                <p>We email a code before anything is removed.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setDeleteOpen(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </header>

            {deleteId ? (
              <div className="field">
                <label htmlFor="delete-code">Code</label>
                <input
                  id="delete-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  value={deleteCode}
                  onChange={(event) =>
                    setDeleteCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                />
                <p className="field-hint">
                  Sent to {user?.email ?? 'your email'}. It expires in 5 minutes.
                </p>
              </div>
            ) : (
              <div className="field">
                <p className="field-hint">
                  A six digit code goes to {user?.email ?? 'your email'}. Typing
                  it removes every commit, branch and session for good.
                </p>
              </div>
            )}

            {deleteError && <p className="field-error">{deleteError}</p>}

            <footer className="dialog-foot">
              <button
                type="button"
                className="ghost"
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="primary danger" disabled={deleteBusy}>
                {deleteBusy ? <Loader2 size={15} className="spin" /> : null}
                {deleteId ? 'Delete forever' : 'Email me a code'}
              </button>
            </footer>
          </form>
        </Layer>
      )}

      {helpOpen && (
        <Layer onClose={closeHelp}>
          <div className="dialog narrow">
            <header className="dialog-head">
              <div>
                <h2>Keyboard shortcuts</h2>
                <p>Everything the log can do from the keys.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={closeHelp}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </header>

            <ul className="shortcuts">
              {SHORTCUTS.map((shortcut) => (
                <li key={shortcut.label + shortcut.keys.join()}>
                  <span className="shortcut-label">{shortcut.label}</span>
                  <span className="shortcut-keys">
                    {shortcut.keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Layer>
      )}
    </>
  )
}

function Layer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return createPortal(
    <div
      className="layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
