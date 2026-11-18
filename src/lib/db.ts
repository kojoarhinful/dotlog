import { deleteDB, openDB } from 'idb'
import type { Bookmark, Branch } from './types'

/**
 * Old versions kept links in IndexedDB. The app now keeps them on the server,
 * so this file only exists to move a local archive over once and remove it.
 */

const LEGACY = 'bookmarks'
const VERSION = 2
const MARKER = 'dotlog:migrated'

type LegacyBookmark = Partial<Bookmark> & { id: string }

async function exists(name: string): Promise<boolean> {
  if (!indexedDB.databases) return true
  try {
    const list = await indexedDB.databases()
    return list.some((item) => item.name === name)
  } catch {
    return true
  }
}

async function read(name: string): Promise<{
  bookmarks: Bookmark[]
  branches: Branch[]
} | null> {
  if (!(await exists(name))) return null

  const db = await openDB(name, VERSION, {
    upgrade(upgrade) {
      if (!upgrade.objectStoreNames.contains('bookmarks')) {
        upgrade.createObjectStore('bookmarks', { keyPath: 'id' })
      }
      if (!upgrade.objectStoreNames.contains('branches')) {
        upgrade.createObjectStore('branches', { keyPath: 'id' })
      }
    },
  })

  const bookmarks = (await db.getAll('bookmarks')) as LegacyBookmark[]
  const branches = (await db.getAll('branches')) as Branch[]
  db.close()

  if (bookmarks.length === 0 && branches.length === 0) return null

  return {
    branches: branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      description: branch.description ?? '',
      parentId: branch.parentId ?? null,
      createdAt: branch.createdAt ?? Date.now(),
    })),
    bookmarks: bookmarks.map((item) => ({
      id: item.id,
      url: item.url ?? '',
      title: item.title ?? '',
      description: item.description ?? '',
      image: item.image ?? '',
      favicon: item.favicon ?? '',
      siteName: item.siteName ?? '',
      branchId: item.branchId ?? null,
      createdAt: item.createdAt ?? Date.now(),
      updatedAt: item.updatedAt ?? item.createdAt ?? Date.now(),
      readAt: item.readAt ?? null,
      archived: item.archived ?? false,
    })),
  }
}

export async function legacyArchive(
  userId: string,
): Promise<{ bookmarks: Bookmark[]; branches: Branch[] } | null> {
  if (localStorage.getItem(`${MARKER}:${userId}`)) return null

  const own = await read(`${LEGACY}:${userId}`)
  if (own) return own
  return read(LEGACY)
}

export async function clearLegacy(userId: string): Promise<void> {
  localStorage.setItem(`${MARKER}:${userId}`, '1')

  for (const name of [`${LEGACY}:${userId}`, LEGACY]) {
    try {
      if (await exists(name)) await deleteDB(name)
    } catch {
      // A closed or blocked database is fine to leave for the next visit.
    }
  }
}
