import Fuse from 'fuse.js'
import type { IFuseOptions } from 'fuse.js'
import type { Bookmark } from './types'
import { hostOf } from './url'

export type Hit = { bookmark: Bookmark; hint: string }

const options: IFuseOptions<Bookmark> = {
  keys: [
    { name: 'title', weight: 3 },
    { name: 'siteName', weight: 1.4 },
    { name: 'description', weight: 1 },
    { name: 'url', weight: 0.7 },
  ],
  threshold: 0.38,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeScore: true,
}

export function search(bookmarks: Bookmark[], query: string): Hit[] {
  const phrase = query.trim()
  if (!phrase) {
    return bookmarks.map((bookmark) => ({ bookmark, hint: hostOf(bookmark.url) }))
  }

  const fuse = new Fuse(bookmarks, options)
  return fuse.search(phrase).map((result) => ({
    bookmark: result.item,
    hint: result.item.description || hostOf(result.item.url),
  }))
}
