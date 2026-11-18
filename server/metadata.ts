/**
 * Reads the Open Graph tags from a link so the client does not have to fight
 * CORS. Used by the Vite dev/preview middleware; the same function can sit
 * behind a small serverless endpoint in production.
 */

export type LinkMetadata = {
  url: string
  title: string
  description: string
  image: string
  favicon: string
  siteName: string
}

const TIMEOUT_MS = 8_000
const MAX_REDIRECTS = 4
const MAX_BYTES = 400_000

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

/** Only remote images are useful here; inline data URIs just render blank. */
function httpOnly(value: string): string {
  return /^https?:\/\//i.test(value) ? value : ''
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

function parseMetadata(html: string, base: URL): LinkMetadata {
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ''
  const title =
    metaContent(html, 'og:title') ||
    metaContent(html, 'twitter:title') ||
    decode(titleTag).replace(/\s+/g, ' ').trim()

  const description =
    metaContent(html, 'og:description') ||
    metaContent(html, 'twitter:description') ||
    metaContent(html, 'description')

  const image = httpOnly(
    resolveUrl(
      metaContent(html, 'og:image') ||
        metaContent(html, 'og:image:url') ||
        metaContent(html, 'twitter:image'),
      base,
    ),
  )

  let favicon = ''
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, 'rel') ?? ''
    if (!/\bicon\b/i.test(rel)) continue
    const href = attr(tag, 'href')
    if (!href) continue
    favicon = resolveUrl(href, base)
    if (favicon) break
  }
  if (!favicon) favicon = resolveUrl('/favicon.ico', base)
  favicon = httpOnly(favicon)

  const siteName = metaContent(html, 'og:site_name') || base.hostname.replace(/^www\./, '')

  return {
    url: base.toString(),
    title: title.slice(0, 300),
    description: description.slice(0, 600),
    image,
    favicon,
    siteName,
  }
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
 * still returns the title, channel and thumbnail, so videos come through.
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
    thumbnail_url?: string
  }

  return {
    url: page.toString(),
    title: (data.title ?? '').slice(0, 300),
    description: '',
    image: httpOnly(data.thumbnail_url ?? ''),
    favicon: 'https://www.youtube.com/favicon.ico',
    siteName: 'YouTube',
  }
}

export async function fetchMetadata(input: string): Promise<LinkMetadata> {
  const normalized = normalizeUrl(input)
  if (!normalized) throw new Error('Enter a valid http or https address.')

  let current = new URL(normalized)

  const video = youtubeVideo(current)
  if (video) {
    if (privateHost(current.hostname)) {
      throw new Error('That address is not reachable from here.')
    }
    return fetchYouTube(current, video)
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (privateHost(current.hostname)) {
      throw new Error('That address is not reachable from here.')
    }

    const response = await fetch(current, {
      redirect: 'manual',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; BookmarksBot/1.0)',
        accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('The page redirected without a destination.')
      current = new URL(location, current)
      continue
    }

    if (!response.ok) throw new Error(`The page returned ${response.status}.`)

    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('text/html') && !type.includes('application/xhtml')) {
      throw new Error('That link is not a web page.')
    }

    const html = await readCapped(response)
    return parseMetadata(html, current)
  }

  throw new Error('Too many redirects.')
}
