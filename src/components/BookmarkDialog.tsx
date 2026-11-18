import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Loader2, RefreshCw, X } from 'lucide-react'
import { BranchPicker } from './BranchPicker'
import { readLink } from '../lib/metadata'
import { useStore } from '../lib/store'
import { messageOf } from '../lib/errors'
import { hostOf, normalizeUrl } from '../lib/url'

export function BookmarkDialog() {
  const dialog = useStore((s) => s.dialog)
  const bookmarks = useStore((s) => s.bookmarks)
  const branches = useStore((s) => s.branches)
  const activeBranch = useStore((s) => s.branch)
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const close = useStore((s) => s.closeDialog)

  const editing =
    dialog?.mode === 'edit' ? bookmarks.find((item) => item.id === dialog.id) : undefined

  const [url, setUrl] = useState(editing?.url ?? (dialog?.mode === 'add' ? dialog.url ?? '' : ''))
  const [title, setTitle] = useState(editing?.title ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [branchId, setBranchId] = useState(
    editing?.branchId ?? (dialog?.mode === 'add' ? activeBranch : null),
  )

  const [image, setImage] = useState(editing?.image ?? '')
  const [favicon, setFavicon] = useState(editing?.favicon ?? '')
  const [siteName, setSiteName] = useState(editing?.siteName ?? '')

  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const urlRef = useRef<HTMLInputElement>(null)
  const fetched = useRef(false)

  const read = async (value: string) => {
    if (fetching) return
    const target = normalizeUrl(value)
    if (!target) {
      setError('Enter a valid http or https URL.')
      return
    }
    setFetching(true)
    setError('')
    try {
      const data = await readLink(target)
      setUrl(data.url)
      if (data.title) setTitle(data.title)
      if (data.description) setDescription(data.description)
      if (data.siteName) setSiteName(data.siteName)
      setImage(data.image)
      setFavicon(data.favicon)
    } catch (problem) {
      setError(messageOf(problem, 'Could not fetch that remote.'))
    } finally {
      setFetching(false)
    }
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => urlRef.current?.focus())
    const seed = dialog?.mode === 'add' ? dialog.url : ''
    if (seed && !fetched.current) {
      fetched.current = true
      void read(seed)
    }
    return () => cancelAnimationFrame(id)
    // The seed only matters on the first mount of this dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        void read(url)
        return
      }
      if (event.key !== 'Escape') return
      // Let an open branch picker close itself first.
      if (document.querySelector('.picker-menu')) return
      event.stopPropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [close, fetching, url])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const target = normalizeUrl(url)
    if (!target) {
      setError('Enter a valid http or https URL.')
      return
    }

    const patch = {
      url: target,
      title: title.trim() || hostOf(target),
      description: description.trim(),
      branchId: branchId || null,
      image,
      favicon,
      siteName,
    }

    setSaving(true)
    setError('')
    try {
      if (editing) {
        await update(editing.id, patch)
        close()
      } else {
        await add(patch)
      }
    } catch (problem) {
      setError(messageOf(problem, 'Could not commit.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <form className="dialog" onSubmit={(event) => void submit(event)}>
        <header className="dialog-head">
          <div>
            <h2>{editing ? 'Amend commit' : 'New commit'}</h2>
            <p>
              {editing
                ? 'Change what this commit keeps.'
                : 'Paste a remote. It is encrypted before it leaves.'}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="field">
          <label htmlFor="bm-url">Remote</label>
          <div className="url-row">
            <input
              id="bm-url"
              ref={urlRef}
              value={url}
              spellCheck={false}
              autoComplete="off"
              placeholder="https://example.com/article"
              onChange={(event) => {
                setUrl(event.target.value)
                setError('')
              }}
            />
            <button
              type="button"
              className="ghost small"
              disabled={fetching}
              title="Fetch metadata (Ctrl or Cmd + Enter)"
              onClick={() => void read(url)}
            >
              {fetching ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {fetching ? 'Fetching' : 'Fetch'}
            </button>
          </div>
          {error ? (
            <p className="field-error">{error}</p>
          ) : (
            <p className="field-hint">
              Fetch sends the URL to our server, which reads the page. We do not
              store it. Ctrl/⌘ + Enter fetches too.
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="bm-title">Subject</label>
          <input
            id="bm-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Leave empty to use the remote"
          />
        </div>

        <div className="field">
          <label htmlFor="bm-desc">Body</label>
          <textarea
            id="bm-desc"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What is this page about?"
          />
        </div>

        <div className="field">
          <label htmlFor="bm-branch">Branch</label>
          <BranchPicker
            id="bm-branch"
            value={branchId}
            branches={branches}
            onChange={setBranchId}
          />
          <p className="field-hint">
            {branches.length === 0
              ? 'No branches yet. Add one from the Branches list.'
              : 'Optional. Pick where this commit lives.'}
          </p>
        </div>

        <footer className="dialog-foot">
          <button type="button" className="ghost" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving || fetching}>
            {saving ? <Loader2 size={15} className="spin" /> : null}
            {editing ? 'Amend' : 'Commit'}
          </button>
        </footer>
      </form>
    </div>
  )
}
