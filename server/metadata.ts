/**
 * Reads the Open Graph tags from a link so the client does not have to fight
 * CORS. The icon is downloaded once here, so the browser never has to ask a
 * saved site for it again.
 */

import { toBase64 } from './crypto'

export type LinkMetadata = {
  url: string
  title: string
  description: string
  favicon: string
  siteName: string
}

const TIMEOUT_MS = 8_000
const ICON_TIMEOUT_MS = 4_000
const MAX_REDIRECTS = 4
const MAX_BYTES = 400_000
const MAX_ICON_BYTES = 64_000
const MAX_ICON_CANDIDATES = 4
const PAGE_AGENT = 'Mozilla/5.0 (compatible; BookmarksBot/1.0)'
const ICON_ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,image/x-icon,image/vnd.microsoft.icon'

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decode(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = Number.parseInt(dec, 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED[name.toLowerCase()] ?? match)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  if (!match) return null
  return decode(match[1] ?? match[2] ?? match[3] ?? '')
}

function metaContent(html: string, key: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const name = attr(tag, 'property') ?? attr(tag, 'name')
    if (name?.toLowerCase() !== key.toLowerCase()) continue
    const content = attr(tag, 'content')
    if (content) return content.trim()
  }
  return ''
}

function resolveUrl(value: string, base: URL): string {
  if (!value) return ''
  try {
    return new URL(value, base).toString()
  } catch {
    return ''
  }
}

function privateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local') || host.endsWith('.internal')) return true
  if (host === '::1' || host === '0.0.0.0') return true
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!v4) return false
  const a = Number(v4[1])
  const b = Number(v4[2])
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

export function normalizeUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname) return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Follows redirects by hand so every hop gets the same address check. The
 * deadline covers the whole chain, not each request.
 */
async function follow(
  start: URL,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ response: Response; final: URL }> {
  const deadline = Date.now() + timeoutMs
  let current = start

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new Error('That address is not reachable from here.')
    }
    if (privateHost(current.hostname)) {
      throw new Error('That address is not reachable from here.')
    }

    const left = deadline - Date.now()
    if (left <= 0) throw new Error('That link took too long to answer.')

    const response = await fetch(current, {
      redirect: 'manual',
      headers,
      signal: AbortSignal.timeout(left),
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('The page redirected without a destination.')
      current = new URL(location, current)
      continue
    }

    return { response, final: current }
  }

  throw new Error('Too many redirects.')
}

/** Reads at most MAX_BYTES off the wire instead of trusting the page. */
async function readCapped(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let html = ''
  let size = 0
  try {
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      html += decoder.decode(value, { stream: true })
    }
  } catch {
    // A broken connection still leaves the part we did read usable.
  } finally {
    await reader.cancel().catch(() => {})
  }
  return html + decoder.decode()
}

function parseMetadata(
  html: string,
  base: URL,
): { title: string; description: string; siteName: string; icons: string[] } {
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ''
  const title =
    metaContent(html, 'og:title') ||
    metaContent(html, 'twitter:title') ||
    decode(titleTag).replace(/\s+/g, ' ').trim()

  const description =
    metaContent(html, 'og:description') ||
    metaContent(html, 'twitter:description') ||
    metaContent(html, 'description')

  const apple: string[] = []
  const other: string[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attr(tag, 'rel') ?? '').toLowerCase()
    const href = attr(tag, 'href')
    if (!href) continue
    if (rel.includes('apple-touch-icon')) {
      apple.push(resolveUrl(href, base))
    } else if (rel.split(/\s+/).includes('icon')) {
      other.push(resolveUrl(href, base))
    }
  }

  const declared = [
    ...new Set([...apple, ...other].filter((url) => /^https?:\/\//i.test(url))),
  ].slice(0, MAX_ICON_CANDIDATES - 1)

  const fallback = resolveUrl('/favicon.ico', base)
  const icons =
    fallback && !declared.includes(fallback) ? [...declared, fallback] : declared

  const siteName = metaContent(html, 'og:site_name') || base.hostname.replace(/^www\./, '')

  return {
    title: title.slice(0, 300),
    description: description.slice(0, 600),
    siteName,
    icons,
  }
}

/** Trusts the file's first bytes, not the headers, which pages often get wrong. */
function imageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif'
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) {
    return 'image/x-icon'
  }
  return null
}

async function readIcon(response: Response): Promise<string | null> {
  if ((response.headers.get('content-type') ?? '').includes('svg')) return null
  if (!response.body) return null

  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > MAX_ICON_BYTES) return null

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (size + value.byteLength > MAX_ICON_BYTES) {
        await reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
      size += value.byteLength
    }
  } catch {
    return null
  } finally {
    await reader.cancel().catch(() => {})
  }

  if (size === 0) return null

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  const type = imageType(bytes)
  if (!type) return null
  return `data:${type};base64,${toBase64(bytes)}`
}

/** Tries each candidate inside one shared budget. A slow icon loses to the title. */
async function fetchIcon(urls: string[]): Promise<string> {
  const deadline = Date.now() + ICON_TIMEOUT_MS

  for (const candidate of urls) {
    const left = deadline - Date.now()
    if (left < 500) break
    try {
      const { response } = await follow(
        new URL(candidate),
        { 'user-agent': PAGE_AGENT, accept: ICON_ACCEPT },
        left,
      )
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        continue
      }
      const icon = await readIcon(response)
      if (icon) return icon
    } catch {
      // Try the next icon instead of failing the whole preview.
    }
  }

  return ''
}

function youtubeVideo(url: URL): string | null {
  const host = url.hostname.replace(/^www\./i, '').toLowerCase()
  if (host === 'youtu.be') {
    return url.pathname.split('/').filter(Boolean)[0] ?? null
  }
  if (
    host !== 'youtube.com' &&
    host !== 'm.youtube.com' &&
    host !== 'music.youtube.com' &&
    host !== 'youtube-nocookie.com'
  ) {
    return null
  }
  if (url.pathname === '/watch') return url.searchParams.get('v')
  const [kind, id] = url.pathname.split('/').filter(Boolean)
  if (kind === 'shorts' || kind === 'embed' || kind === 'live' || kind === 'v') {
    return id ?? null
  }
  return null
}

/**
 * YouTube answers bot user agents with 429 on watch pages. Its oEmbed API
 * still returns the title and channel, so videos come through.
 */
async function fetchYouTube(page: URL, id: string): Promise<LinkMetadata> {
  const endpoint = new URL('https://www.youtube.com/oembed')
  endpoint.searchParams.set('url', `https://www.youtube.com/watch?v=${id}`)
  endpoint.searchParams.set('format', 'json')

  const response = await fetch(endpoint, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`YouTube returned ${response.status}.`)

  const data = (await response.json().catch(() => ({}))) as {
    title?: string
  }

  const favicon = await fetchIcon(['https://www.youtube.com/favicon.ico'])

  return {
    url: page.toString(),
    title: (data.title ?? '').slice(0, 300),
    description: '',
    favicon,
    siteName: 'YouTube',
  }
}

export async function fetchMetadata(input: string): Promise<LinkMetadata> {
  const normalized = normalizeUrl(input)
  if (!normalized) throw new Error('Enter a valid http or https address.')

  const page = new URL(normalized)

  const video = youtubeVideo(page)
  if (video) {
    if (privateHost(page.hostname)) {
      throw new Error('That address is not reachable from here.')
    }
    return fetchYouTube(page, video)
  }

  const { response, final } = await follow(
    page,
    {
      'user-agent': PAGE_AGENT,
      accept: 'text/html,application/xhtml+xml',
    },
    TIMEOUT_MS,
  )

  if (!response.ok) throw new Error(`The page returned ${response.status}.`)

  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('text/html') && !type.includes('application/xhtml')) {
    throw new Error('That link is not a web page.')
  }

  const html = await readCapped(response)
  const info = parseMetadata(html, final)
  const favicon = await fetchIcon(info.icons)

  return {
    url: final.toString(),
    title: info.title,
    description: info.description,
    favicon,
    siteName: info.siteName,
  }
}
