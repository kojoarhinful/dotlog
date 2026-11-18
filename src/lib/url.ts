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

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const TINTS = [
  '#6366f1',
  '#f97316',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#eab308',
  '#ef4444',
]

export function tintFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return TINTS[Math.abs(hash) % TINTS.length]
}

export function initialOf(title: string, url: string): string {
  const source = title.trim() || hostOf(url)
  return (source[0] ?? '?').toUpperCase()
}
