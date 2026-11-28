import { useEffect, useRef, useState } from 'react'
import { MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { sortBranches } from '../lib/branches'
import { useStore } from '../lib/store'
import type { Branch } from '../lib/types'

export function BranchSection() {
  const branches = useStore((s) => s.branches)
  const active = useStore((s) => s.branch)
  const setBranch = useStore((s) => s.setBranch)
  const openBranch = useStore((s) => s.openBranch)
  const editBranch = useStore((s) => s.editBranch)
  const askDeleteBranch = useStore((s) => s.askDeleteBranch)

  const sorted = sortBranches(branches)
  const roots = sorted.filter((item) => !item.parentId)

  return (
    <div className="side-branch">
      <div className="side-head">
        <span className="side-label">Branches</span>
        <button
          className="side-head-add"
          title="New branch"
          aria-label="New branch"
          onClick={() => openBranch(null)}
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="side-branches">
        {roots.length === 0 ? (
          <p className="side-empty">No branches yet.</p>
        ) : (
          roots.map((branch) => (
            <BranchNode
              key={branch.id}
              branch={branch}
              branches={sorted}
              active={active}
              onPick={setBranch}
              onAdd={openBranch}
              onEdit={editBranch}
              onDelete={askDeleteBranch}
            />
          ))
        )}
      </div>
    </div>
  )
}

type NodeProps = {
  branch: Branch
  branches: Branch[]
  active: string | null
  onPick: (id: string | null) => void
  onAdd: (parentId: string | null) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

function BranchNode({
  branch,
  branches,
  active,
  onPick,
  onAdd,
  onEdit,
  onDelete,
}: NodeProps) {
  const children = branches.filter((item) => item.parentId === branch.id)
  const selected = active === branch.id
  const [acts, setActs] = useState(false)
  const [above, setAbove] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selected) setActs(false)
  }, [selected])

  useEffect(() => {
    if (!acts) return
    const close = (event: PointerEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) setActs(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [acts])

  return (
    <div className="branch-node">
      <div
        ref={rowRef}
        className={`branch-row${selected ? ' act' : ''}${acts ? ' show-acts' : ''}${
          above ? ' above' : ''
        }`}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('.branch-act')) setActs(false)
        }}
      >
        <button
          className="branch-pick"
          title={branch.description || branch.name}
          aria-current={selected ? 'true' : undefined}
          onClick={() => onPick(selected ? null : branch.id)}
        >
          <span className="branch-hash">#</span>
          <span className="branch-name">{branch.name}</span>
        </button>
        <div className="branch-acts">
          <button
            className="branch-act"
            title={`New sub-branch in ${branch.name}`}
            aria-label={`New sub-branch in ${branch.name}`}
            onClick={() => onAdd(branch.id)}
          >
            <Plus size={12} />
            <span className="branch-label">New sub-branch</span>
          </button>
          <button
            className="branch-act"
            title={`Edit ${branch.name}`}
            aria-label={`Edit ${branch.name}`}
            onClick={() => onEdit(branch.id)}
          >
            <Pencil size={11} />
            <span className="branch-label">Edit branch</span>
          </button>
          <button
            className="branch-act danger"
            title={`Delete ${branch.name}`}
            aria-label={`Delete ${branch.name}`}
            onClick={() => onDelete(branch.id)}
          >
            <Trash2 size={11} />
            <span className="branch-label">Delete branch</span>
          </button>
        </div>
        <button
          className="branch-more"
          title={`Actions for ${branch.name}`}
          aria-label={`Actions for ${branch.name}`}
          aria-expanded={acts}
          onClick={() => {
            if (acts) {
              setActs(false)
              return
            }
            const box = rowRef.current?.getBoundingClientRect()
            const list = rowRef.current
              ?.closest('.side-branches')
              ?.getBoundingClientRect()
            if (box && list) {
              const below = list.bottom - box.bottom
              const above = box.top - list.top
              setAbove(below < 126 && above > below)
            } else {
              setAbove(false)
            }
            setActs(true)
          }}
        >
          <MoreVertical size={13} />
        </button>
      </div>

      {children.length > 0 && (
        <div className="branch-kids">
          {children.map((child) => (
            <BranchNode
              key={child.id}
              branch={child}
              branches={branches}
              active={active}
              onPick={onPick}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
