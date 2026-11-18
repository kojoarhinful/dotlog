import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Search as SearchIcon } from 'lucide-react'
import { search } from '../lib/search'
import { useStore } from '../lib/store'
import { hostOf, initialOf, tintFor } from '../lib/url'

const MAX_RESULTS = 7

export function SearchBox() {
  const open = useStore((s) => s.searchOpen)
  const close = useStore((s) => s.closeSearch)
  const bookmarks = useStore((s) => s.bookmarks)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const results = useMemo(
    () => search(bookmarks.filter((item) => !item.archived), query),
    [bookmarks, query],
  )
  const phrase = query.trim()
  // Idle shows a short list of suggestions. A real query shows every match.
  const hits = phrase ? results : results.slice(0, MAX_RESULTS)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    const list = resultsRef.current
    if (!list) return
    const active = list.querySelector<HTMLElement>(`[data-index="${index}"]`)
    active?.scrollIntoView({ block: 'nearest' })
  }, [index, phrase])

  if (!open) return null

  const go = (position: number) => {
    const hit = hits[position]
    if (!hit) return
    close()
    window.open(hit.bookmark.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className="search-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className="searchbox">
        <div className="search-field">
          <SearchIcon size={16} />
          <input
            ref={inputRef}
            value={query}
            spellCheck={false}
            autoComplete="off"
            placeholder="Search commits... (Esc to close)"
            onChange={(event) => {
              setQuery(event.target.value)
              setIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                if (hits.length) setIndex((i) => (i + 1) % hits.length)
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                if (hits.length) setIndex((i) => (i - 1 + hits.length) % hits.length)
              } else if (event.key === 'Enter') {
                event.preventDefault()
                go(index)
              } else if (event.key === 'Escape') {
                event.preventDefault()
                close()
              }
            }}
          />
          <kbd>esc</kbd>
        </div>

        <div className="sres" ref={resultsRef}>
          {hits.length === 0 ? (
            <div className="none">
              {bookmarks.length === 0 ? 'No commits yet' : 'Nothing found'}
            </div>
          ) : (
            hits.map((hit, i) => (
              <button
                key={hit.bookmark.id}
                type="button"
                data-index={i}
                className={i === index ? 'act' : undefined}
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(i)}
              >
                <span className="sres-row">
                  <span className="sres-dot" style={{ background: tintFor(hostOf(hit.bookmark.url)) }}>
                    {initialOf(hit.bookmark.title, hit.bookmark.url)}
                  </span>
                  <span className="sres-title">
                    {hit.bookmark.title || hostOf(hit.bookmark.url)}
                  </span>
                  <small>{hostOf(hit.bookmark.url)}</small>
                  <ArrowUpRight size={13} className="sres-go" />
                </span>
                {hit.hint && <span className="sres-hint">{hit.hint}</span>}
              </button>
            ))
          )}
        </div>

        <div className="search-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span className="search-count">
            {!phrase && results.length > hits.length
              ? `${hits.length} of ${results.length}`
              : `${results.length} ${results.length === 1 ? 'commit' : 'commits'}`}
          </span>
        </div>
      </div>
    </div>
  )
}
