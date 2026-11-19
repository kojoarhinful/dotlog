/**
 * Icons arrive as data URLs from the server, then get redrawn here before they
 * are encrypted. The redraw makes them small and strips anything unusual the
 * original file carried.
 */

const STORED_PREFIX = 'data:image/png;base64,'
const SOURCE = /^data:image\/(png|jpeg|gif|webp|x-icon|vnd\.microsoft\.icon);base64,/i
const MAX_STORED = 20_000
const SIZE = 32

/** Only the exact shape produced by shrinkIcon may be rendered. */
export function isStoredIcon(value: string): boolean {
  if (!value.startsWith(STORED_PREFIX)) return false
  const body = value.slice(STORED_PREFIX.length)
  if (!body || body.length > MAX_STORED) return false
  return /^[A-Za-z0-9+/]+={0,2}$/.test(body)
}

/** Returns '' when the bytes cannot be decoded, so the letter tile shows instead. */
export async function shrinkIcon(source: string): Promise<string> {
  if (!SOURCE.test(source)) return ''

  const image = new Image()
  image.src = source

  try {
    await image.decode()
  } catch {
    return ''
  }

  if (!image.naturalWidth || !image.naturalHeight) return ''

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const context = canvas.getContext('2d')
  if (!context) return ''

  const ratio = Math.min(SIZE / image.naturalWidth, SIZE / image.naturalHeight)
  const width = Math.max(1, Math.round(image.naturalWidth * ratio))
  const height = Math.max(1, Math.round(image.naturalHeight * ratio))

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.clearRect(0, 0, SIZE, SIZE)
  context.drawImage(
    image,
    Math.round((SIZE - width) / 2),
    Math.round((SIZE - height) / 2),
    width,
    height,
  )

  const result = canvas.toDataURL('image/png')
  return isStoredIcon(result) ? result : ''
}
