import { create } from 'zustand'
import { api, del, post, put, type Stored } from './api'
import { clearLegacy, legacyArchive } from './db'
import { dataKey, decryptRecord, encryptRecord } from './crypto'
import type { Bookmark, Branch } from './types'
import { normalizeUrl } from './url'

export type Filter = 'all' | 'unread' | 'read' | 'stashed'

export type DialogState =
  | null
  | { mode: 'add'; url?: string }
  | { mode: 'edit'; id: string }

export type BranchDialogState =
  | null
  | { mode: 'create'; parentId: string | null }
  | { mode: 'edit'; id: string }
  | { mode: 'delete'; id: string }

type Toast = { id: number; message: string }

type State = {
  bookmarks: Bookmark[]
  branches: Branch[]
  version: number
  ready: boolean
  filter: Filter
  branch: string | null
  searchOpen: boolean
  helpOpen: boolean
  dialog: DialogState
  branchDialog: BranchDialogState
  confirmId: string | null
  toast: Toast | null
  load: (userId: string) => Promise<void>
  reload: () => Promise<void>
  sync: () => Promise<void>
  reset: () => void
  add: (input: Partial<Bookmark> & { url: string }) => Promise<Bookmark>
  update: (id: string, patch: Partial<Bookmark>) => Promise<void>
  stash: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  toggleRead: (id: string) => Promise<void>
  addBranch: (input: {
    name: string
    description: string
    parentId?: string | null
  }) => Promise<Branch>
  renameBranch: (
    id: string,
    input: { name: string; description: string },
  ) => Promise<void>
  removeBranch: (id: string) => Promise<void>
  setFilter: (filter: Filter) => void
  setBranch: (id: string | null) => void
  openSearch: () => void
  closeSearch: () => void
  openHelp: () => void
  closeHelp: () => void
  openAdd: (url?: string) => void
  openEdit: (id: string) => void
  closeDialog: () => void
  openBranch: (parentId?: string | null) => void
  editBranch: (id: string) => void
  askDeleteBranch: (id: string) => void
  closeBranch: () => void
  askStash: (id: string) => void
  cancelStash: () => void
  notify: (message: string) => void
  clearToast: () => void
}

type Kind = 'bookmarks' | 'branches'

/**
 * Every tab keeps its own copy of the log. A change in one tab tells the
 * others to pull again, otherwise they show stale data until a reload.
 */
const tabs =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('dotlog')

function announce(): void {
  tabs?.postMessage('changed')
}

function sortNewest(list: Bookmark[]): Bookmark[] {
  return [...list].sort((a, b) => b.createdAt - a.createdAt)
}

async function save(kind: Kind, id: string, value: unknown): Promise<void> {
  const updatedAt = Date.now()
  const data = await encryptRecord(dataKey(), value, `${kind}:${id}`)
  await put(`/api/data/${kind}/${id}`, { data, updatedAt })
  announce()
}

async function drop(kind: Kind, id: string): Promise<void> {
  await del(`/api/data/${kind}/${id}`)
  announce()
}

async function pullAll(): Promise<{
  bookmarks: Bookmark[]
  branches: Branch[]
  version: number
}> {
  const rows = await api<{
    bookmarks: Stored[]
    branches: Stored[]
    version: number
  }>('/api/data')
  const key = dataKey()

  return {
    bookmarks: await Promise.all(
      rows.bookmarks.map((row) =>
        decryptRecord<Bookmark>(key, row.data, `bookmarks:${row.id}`),
      ),
    ),
    branches: await Promise.all(
      rows.branches.map((row) =>
        decryptRecord<Branch>(key, row.data, `branches:${row.id}`),
      ),
    ),
    version: rows.version,
  }
}

async function importArchive(userId: string): Promise<void> {
  const archive = await legacyArchive(userId)
  if (!archive) return

  const key = dataKey()
  const seal = (kind: Kind, id: string, value: unknown) =>
    encryptRecord(key, value, `${kind}:${id}`)

  const bookmarks = await Promise.all(
    archive.bookmarks.map(async (item) => ({
      id: item.id,
      data: await seal('bookmarks', item.id, item),
      updatedAt: item.updatedAt,
    })),
  )

  const branches = await Promise.all(
    archive.branches.map(async (item) => ({
      id: item.id,
      data: await seal('branches', item.id, item),
      updatedAt: item.createdAt,
    })),
  )

  await post('/api/data/import', { bookmarks, branches })
  await clearLegacy(userId)
}

let toastTimer: number | undefined

export const useStore = create<State>((set, get) => ({
  bookmarks: [],
  branches: [],
  version: 0,
  ready: false,
  filter: 'all',
  branch: null,
  searchOpen: false,
  helpOpen: false,
  dialog: null,
  branchDialog: null,
  confirmId: null,
  toast: null,

  load: async (userId: string) => {
    await importArchive(userId)
    const { bookmarks, branches, version } = await pullAll()
    set({ bookmarks: sortNewest(bookmarks), branches, version, ready: true })
  },

  reload: async () => {
    try {
      const { bookmarks, branches, version } = await pullAll()
      set((state) => {
        const editing = state.dialog?.mode === 'edit' ? state.dialog.id : null
        const gone = (id: string | null) =>
          id !== null && !bookmarks.some((item) => item.id === id)

        return {
          bookmarks: sortNewest(bookmarks),
          branches,
          version,
          // An open dialog may point at something another tab deleted.
          dialog: gone(editing) ? null : state.dialog,
          confirmId: gone(state.confirmId) ? null : state.confirmId,
        }
      })
    } catch {
      // Locked tab or a failed request. The next change or reload retries.
    }
  },

  sync: async () => {
    if (!get().ready) return
    try {
      const { version } = await api<{ version: number }>('/api/data/version')
      if (version !== get().version) await get().reload()
    } catch {
      // Offline or a locked tab. The next poll retries.
    }
  },

  reset: () =>
    set({
      bookmarks: [],
      branches: [],
      version: 0,
      ready: false,
      filter: 'all',
      branch: null,
      searchOpen: false,
      helpOpen: false,
      dialog: null,
      branchDialog: null,
      confirmId: null,
      toast: null,
    }),

  add: async (input) => {
    const url = normalizeUrl(input.url)
    if (!url) throw new Error('That is not a valid URL.')

    const existing = get().bookmarks.find((item) => item.url === url)
    if (existing) {
      set({ dialog: null })
      if (existing.archived) {
        await get().restore(existing.id)
        get().notify('Restored from stash')
      } else {
        get().notify('Already committed')
      }
      return existing
    }

    const now = Date.now()
    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      url,
      title: input.title?.trim() ?? '',
      description: input.description?.trim() ?? '',
      image: input.image ?? '',
      favicon: input.favicon ?? '',
      siteName: input.siteName ?? '',
      branchId: input.branchId ?? null,
      createdAt: now,
      updatedAt: now,
      readAt: null,
      archived: false,
    }

    await save('bookmarks', bookmark.id, bookmark)
    set((state) => ({
      bookmarks: sortNewest([bookmark, ...state.bookmarks]),
      dialog: null,
    }))
    get().notify('Committed')
    return bookmark
  },

  update: async (id, patch) => {
    const current = get().bookmarks.find((item) => item.id === id)
    if (!current) return
    const next: Bookmark = { ...current, ...patch, updatedAt: Date.now() }
    await save('bookmarks', id, next)
    set((state) => ({
      bookmarks: state.bookmarks.map((item) => (item.id === id ? next : item)),
    }))
  },

  stash: async (id) => {
    await get().update(id, { archived: true })
    set((state) => ({ confirmId: state.confirmId === id ? null : state.confirmId }))
    get().notify('Stashed')
  },

  restore: async (id) => {
    await get().update(id, { archived: false })
    set((state) => ({ confirmId: state.confirmId === id ? null : state.confirmId }))
    get().notify('Restored')
  },

  remove: async (id) => {
    await drop('bookmarks', id)
    set((state) => ({
      bookmarks: state.bookmarks.filter((item) => item.id !== id),
      dialog:
        state.dialog?.mode === 'edit' && state.dialog.id === id
          ? null
          : state.dialog,
      confirmId: state.confirmId === id ? null : state.confirmId,
    }))
    get().notify('Deleted forever')
  },

  toggleRead: async (id) => {
    const current = get().bookmarks.find((item) => item.id === id)
    if (!current) return
    await get().update(id, { readAt: current.readAt ? null : Date.now() })
  },

  addBranch: async ({ name, description, parentId }) => {
    const clean = name.trim().replace(/\s+/g, ' ')
    if (!clean) throw new Error('Give the branch a name.')

    const parent = parentId ?? null
    const siblings = get().branches.filter((item) => item.parentId === parent)
    if (siblings.some((item) => item.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error('That branch already exists here.')
    }

    const branch: Branch = {
      id: crypto.randomUUID(),
      name: clean,
      description: description.trim(),
      parentId: parent,
      createdAt: Date.now(),
    }

    await save('branches', branch.id, branch)
    set((state) => ({
      branches: [...state.branches, branch],
      branchDialog: null,
    }))
    get().notify('Branch created')
    return branch
  },

  renameBranch: async (id, { name, description }) => {
    const current = get().branches.find((item) => item.id === id)
    if (!current) return

    const clean = name.trim().replace(/\s+/g, ' ')
    if (!clean) throw new Error('Give the branch a name.')

    const siblings = get().branches.filter(
      (item) => item.parentId === current.parentId && item.id !== id,
    )
    if (siblings.some((item) => item.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error('That branch already exists here.')
    }

    const next: Branch = {
      ...current,
      name: clean,
      description: description.trim(),
    }

    await save('branches', id, next)
    set((state) => ({
      branches: state.branches.map((item) => (item.id === id ? next : item)),
      branchDialog: null,
    }))
    get().notify('Branch updated')
  },

  removeBranch: async (id) => {
    const current = get().branches.find((item) => item.id === id)
    if (!current) return

    const parentId = current.parentId
    const children = get().branches.filter((item) => item.parentId === id)
    const commits = get().bookmarks.filter((item) => item.branchId === id)

    // Nothing is nested under a dead branch: children and commits move up.
    for (const child of children) {
      await save('branches', child.id, { ...child, parentId })
    }
    for (const commit of commits) {
      await save('bookmarks', commit.id, { ...commit, branchId: parentId })
    }
    await drop('branches', id)

    set((state) => ({
      branches: state.branches
        .filter((item) => item.id !== id)
        .map((item) => (item.parentId === id ? { ...item, parentId } : item)),
      bookmarks: state.bookmarks.map((item) =>
        item.branchId === id ? { ...item, branchId: parentId } : item,
      ),
      branch: state.branch === id ? parentId : state.branch,
      branchDialog: null,
      confirmId: null,
    }))
    get().notify('Branch deleted')
  },

  setFilter: (filter) => set({ filter, branch: null, confirmId: null }),
  setBranch: (branch) => set({ branch, filter: 'all', confirmId: null }),

  openSearch: () => set({ searchOpen: true, confirmId: null }),
  closeSearch: () => set({ searchOpen: false }),
  openHelp: () => set({ helpOpen: true, confirmId: null }),
  closeHelp: () => set({ helpOpen: false }),

  openAdd: (url) => set({ dialog: { mode: 'add', url }, confirmId: null }),
  openEdit: (id) => set({ dialog: { mode: 'edit', id }, confirmId: null }),
  closeDialog: () => set({ dialog: null }),

  openBranch: (parentId = null) =>
    set({ branchDialog: { mode: 'create', parentId }, confirmId: null }),
  editBranch: (id) => set({ branchDialog: { mode: 'edit', id }, confirmId: null }),
  askDeleteBranch: (id) =>
    set({ branchDialog: { mode: 'delete', id }, confirmId: null }),
  closeBranch: () => set({ branchDialog: null }),

  askStash: (id) => set({ confirmId: id }),
  cancelStash: () => set({ confirmId: null }),

  notify: (message) => {
    window.clearTimeout(toastTimer)
    set({ toast: { id: Date.now(), message } })
    toastTimer = window.setTimeout(() => set({ toast: null }), 2600)
  },

  clearToast: () => set({ toast: null }),
}))

tabs?.addEventListener('message', () => {
  void useStore.getState().reload()
})
