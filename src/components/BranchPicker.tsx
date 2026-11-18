import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { flattenBranches, sortBranches } from '../lib/branches'
import type { Branch } from '../lib/types'

type Props = {
  id?: string
  value: string | null
  branches: Branch[]
  onChange: (id: string | null) => void
}

export function BranchPicker({ id, value, branches, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState({ left: 0, top: 0, width: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const options = useMemo(
    () => flattenBranches(sortBranches(branches)),
    [branches],
  )
  const selected = options.find((item) => item.branch.id === value)?.branch

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const box = buttonRef.current?.getBoundingClientRect()
    if (!box) return
    const menuHeight = Math.min(260, (options.length + 1) * 32 + 12)
    const below = window.innerHeight - box.bottom
    const top =
      below >= menuHeight + 14 ? box.bottom + 6 : Math.max(12, box.top - menuHeight - 6)
    setRect({ left: box.left, top, width: box.width })
    setOpen(true)
  }

  const choose = (next: string | null) => {
    onChange(next)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <>
      <button
        id={id}
        ref={buttonRef}
        type="button"
        className={`picker${open ? ' open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className={`picker-value${selected ? '' : ' empty'}`}>
          {selected ? (
            <>
              <span className="picker-hash">#</span>
              {selected.name}
            </>
          ) : (
            'No branch'
          )}
        </span>
        <ChevronDown size={14} className="picker-chev" />
      </button>

      {open &&
        createPortal(
          <div
            className="picker-menu"
            ref={menuRef}
            role="listbox"
            aria-label="Branches"
            style={{ left: rect.left, top: rect.top, width: rect.width }}
          >
            <button
              type="button"
              role="option"
              aria-selected={!value}
              className={`picker-opt${value ? '' : ' act'}`}
              onClick={() => choose(null)}
            >
              <span className="picker-name">No branch</span>
              {!value && <Check size={13} className="picker-check" />}
            </button>

            {options.map(({ branch, depth }) => (
              <button
                key={branch.id}
                type="button"
                role="option"
                aria-selected={value === branch.id}
                className={`picker-opt${value === branch.id ? ' act' : ''}`}
                style={{ paddingLeft: 10 + depth * 14 }}
                onClick={() => choose(branch.id)}
              >
                <span className="picker-hash">#</span>
                <span className="picker-name">{branch.name}</span>
                {value === branch.id && <Check size={13} className="picker-check" />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
