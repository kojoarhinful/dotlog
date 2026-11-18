import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Loader2, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { messageOf } from '../lib/errors'

export function BranchDialog() {
  const dialog = useStore((s) => s.branchDialog)
  const branches = useStore((s) => s.branches)
  const addBranch = useStore((s) => s.addBranch)
  const renameBranch = useStore((s) => s.renameBranch)
  const removeBranch = useStore((s) => s.removeBranch)
  const close = useStore((s) => s.closeBranch)

  const target =
    dialog && dialog.mode !== 'create'
      ? branches.find((item) => item.id === dialog.id)
      : undefined

  const [name, setName] = useState(target?.name ?? '')
  const [description, setDescription] = useState(target?.description ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)

  const parent =
    dialog?.mode === 'create'
      ? dialog.parentId
        ? branches.find((item) => item.id === dialog.parentId)
        : undefined
      : target?.parentId
        ? branches.find((item) => item.id === target.parentId)
        : undefined

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (dialog?.mode === 'delete') deleteRef.current?.focus()
      else nameRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [dialog?.mode])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [close])

  if (!dialog) return null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Give the branch a name.')
      return
    }

    setSaving(true)
    setError('')
    try {
      if (dialog.mode === 'edit') {
        await renameBranch(dialog.id, { name, description })
      } else if (dialog.mode === 'create') {
        await addBranch({ name, description, parentId: dialog.parentId })
      }
    } catch (problem) {
      setError(messageOf(problem, 'Could not save the branch.'))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (dialog.mode !== 'delete') return
    setSaving(true)
    setError('')
    try {
      await removeBranch(dialog.id)
    } catch (problem) {
      setError(messageOf(problem, 'Could not delete the branch.'))
      setSaving(false)
    }
  }

  const deleting = dialog.mode === 'delete'

  return (
    <div
      className="layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <form
        className="dialog narrow"
        onSubmit={(event) => void submit(event)}
      >
        <header className="dialog-head">
          <div>
            <h2>
              {dialog.mode === 'create'
                ? 'New branch'
                : dialog.mode === 'edit'
                  ? 'Edit branch'
                  : 'Delete branch'}
            </h2>
            <p>
              {deleting
                ? target
                  ? `#${target.name}`
                  : 'This branch'
                : parent
                  ? `Inside #${parent.name}`
                  : 'A top-level branch.'}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {deleting ? (
          <p className="dialog-note">
            Commits and sub-branches move up one level. Nothing is stashed.
          </p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="branch-name">Name</label>
              <input
                id="branch-name"
                ref={nameRef}
                value={name}
                autoComplete="off"
                placeholder={parent ? 'Sub-branch name' : 'design, reading, later'}
                onChange={(event) => {
                  setName(event.target.value)
                  setError('')
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="branch-desc">Description</label>
              <textarea
                id="branch-desc"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What belongs in here?"
              />
              <p className="field-hint">Shown when you hover the branch.</p>
            </div>
          </>
        )}

        {error && <p className="field-error">{error}</p>}

        <footer className="dialog-foot">
          <button type="button" className="ghost" onClick={close}>
            Cancel
          </button>
          {deleting ? (
            <button
              type="button"
              ref={deleteRef}
              className="primary danger"
              disabled={saving}
              onClick={() => void confirmDelete()}
            >
              {saving ? <Loader2 size={15} className="spin" /> : null}
              Delete branch
            </button>
          ) : (
            <button type="submit" className="primary" disabled={saving}>
              {saving ? <Loader2 size={15} className="spin" /> : null}
              {dialog.mode === 'edit' ? 'Save branch' : 'Create branch'}
            </button>
          )}
        </footer>
      </form>
    </div>
  )
}
