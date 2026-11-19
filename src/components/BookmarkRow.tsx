import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ArrowUpRight,
  Check,
  Circle,
  Copy,
  Pencil,
  RotateCcw,
  MoreVertical,
  Trash2,
} from 'lucide-react'
import { shortDate } from '../lib/format'
import { isStoredIcon } from '../lib/icon'
import { useStore } from '../lib/store'
import type { Bookmark } from '../lib/types'
import { hostOf, initialOf, tintFor } from '../lib/url'

type Props = { bookmark: Bookmark }

export function BookmarkRow({ bookmark }: Props) {
  const openEdit = useStore((s) => s.openEdit)
  const remove = useStore((s) => s.remove)
  const stash = useStore((s) => s.stash)
  const restore = useStore((s) => s.restore)
  const toggleRead = useStore((s) => s.toggleRead)
  const notify = useStore((s) => s.notify)
  const branches = useStore((s) => s.branches)
  const setBranch = useStore((s) => s.setBranch)
  const askStash = useStore((s) => s.askStash)
  const cancelStash = useStore((s) => s.cancelStash)
  const confirming = useStore((s) => s.confirmId === bookmark.id)

  const [brokenIcon, setBrokenIcon] = useState(false)
  const icon = useMemo(
    () => (isStoredIcon(bookmark.favicon) ? bookmark.favicon : ''),
    [bookmark.favicon],
  )
  // Touch has no hover, so a tap walks the row up: dots, then actions.
  const [stage, setStage] = useState(0)
  const [above, setAbove] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const stashRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (confirming) stashRef.current?.focus()
  }, [confirming])

  useEffect(() => {
    if (stage === 0) return
    const close = (event: PointerEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) setStage(0)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [stage])

  const host = hostOf(bookmark.url)
  const title = bookmark.title || host
  const read = !!bookmark.readAt
  const tint = tintFor(host)
  const branch = bookmark.branchId
    ? branches.find((item) => item.id === bookmark.branchId)
    : undefined

  const open = () => window.open(bookmark.url, '_blank', 'noopener,noreferrer')

  /**
   * Touch screens have no hover, so a tap only reveals the dots. A second tap
   * on the card closes it again; opening is always an explicit action.
   */
  const activate = () => {
    if (window.matchMedia('(pointer: coarse)').matches) {
      setStage((current) => (current === 0 ? 1 : 0))
      return
    }
    open()
  }

  /** The action menu needs room below; near the bottom it opens upward. */
  const toggleActions = () => {
    if (stage === 2) {
      setStage(1)
      return
    }
    const box = rowRef.current?.getBoundingClientRect()
    setAbove(!!box && window.innerHeight - box.bottom < 240)
    setStage(2)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bookmark.url)
      notify('Remote copied')
    } catch {
      notify('Could not copy the remote')
    }
  }

  return (
    <div
      ref={rowRef}
      className={`row${read ? ' is-read' : ''}${stage ? ' show-more' : ''}${stage === 2 ? ' show-acts' : ''}${above ? ' above' : ''}`}
      style={{ '--tint': tint } as CSSProperties}
      data-bm={bookmark.id}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          open()
        }
      }}
      role="link"
      tabIndex={0}
      aria-label={`Open ${title}`}
    >
      <span className="row-icon">
        {icon && !brokenIcon ? (
          <img
            src={icon}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBrokenIcon(true)}
          />
        ) : (
          <span>{initialOf(title, bookmark.url)}</span>
        )}
      </span>

      <div className="row-main">
        <div className="row-title">{title}</div>

        {branch && (
          <div className="row-tags">
            <button
              className="row-tag"
              onClick={(event) => {
                event.stopPropagation()
                setBranch(branch.id)
              }}
            >
              <span className="hash">#</span>
              {branch.name}
            </button>
          </div>
        )}

        <div className="row-meta">
          <span>{host}</span>
          <span className="sep">·</span>
          <span>{shortDate(bookmark.createdAt)}</span>
          {read && (
            <>
              <span className="sep">·</span>
              <span className="row-read">
                <Check size={11} strokeWidth={3} />
                reviewed
              </span>
            </>
          )}
        </div>
      </div>

      <div
        className={`row-side${confirming ? ' confirm' : ''}`}
        onClick={(event) => {
          event.stopPropagation()
          if ((event.target as HTMLElement).closest('button:not(.row-more)'))
            setStage(0)
        }}
      >
        {confirming ? (
          <>
            <span className="confirm-label">
              {bookmark.archived ? 'Delete forever?' : 'Stash this commit?'}
            </span>
            <button className="row-text" onClick={() => cancelStash()}>
              Cancel
            </button>
            <button
              ref={stashRef}
              className="row-text danger"
              onClick={() =>
                void (bookmark.archived ? remove(bookmark.id) : stash(bookmark.id))
              }
            >
              {bookmark.archived ? 'Delete' : 'Stash'}
            </button>
          </>
        ) : (
          <>
            <button
              className="row-open"
              title="Open in a new tab"
              aria-label="Open in a new tab"
              onClick={open}
            >
              <ArrowUpRight size={15} />
              <span className="row-label">Open</span>
            </button>
            {!bookmark.archived && (
              <button
                title={read ? 'Mark as unreviewed' : 'Mark as reviewed'}
                aria-label={read ? 'Mark as unreviewed' : 'Mark as reviewed'}
                onClick={() => void toggleRead(bookmark.id)}
              >
                {read ? <Check size={15} /> : <Circle size={15} />}
                <span className="row-label">
                  {read ? 'Mark unreviewed' : 'Mark reviewed'}
                </span>
              </button>
            )}
            <button
              className="row-copy"
              title="Copy remote"
              aria-label="Copy remote"
              onClick={() => void copy()}
            >
              <Copy size={14} />
              <span className="row-label">Copy remote</span>
            </button>
            {bookmark.archived ? (
              <button
                title="Restore commit"
                aria-label="Restore commit"
                onClick={() => void restore(bookmark.id)}
              >
                <RotateCcw size={14} />
                <span className="row-label">Restore</span>
              </button>
            ) : (
              <button
                title="Amend commit"
                aria-label="Amend commit"
                onClick={() => openEdit(bookmark.id)}
              >
                <Pencil size={14} />
                <span className="row-label">Amend</span>
              </button>
            )}
            <button
              className="danger"
              title={bookmark.archived ? 'Delete forever' : 'Stash commit'}
              aria-label={bookmark.archived ? 'Delete forever' : 'Stash commit'}
              onClick={() => askStash(bookmark.id)}
            >
              <Trash2 size={14} />
              <span className="row-label">
                {bookmark.archived ? 'Delete' : 'Stash'}
              </span>
            </button>
            <button
              className="row-more"
              title="Commit actions"
              aria-label="Commit actions"
              aria-expanded={stage === 2}
              onClick={(event) => {
                event.stopPropagation()
                toggleActions()
              }}
            >
              <MoreVertical size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
