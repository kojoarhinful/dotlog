/**
 * WebCrypto only, because this code runs in a Worker where node:crypto and
 * scrypt do not exist. Nothing here ever sees a password: the browser derives a
 * verifier with PBKDF2 and this side only hashes and compares it.
 */

const encoder = new TextEncoder()

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomId(): string {
  return crypto.randomUUID()
}

export function randomCode(): string {
  const [value] = crypto.getRandomValues(new Uint32Array(1))
  return String(value % 1_000_000).padStart(6, '0')
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase()
}

export function normalizeCode(input: string): string {
  return input.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

/** Compares two hex digests without leaking how far they matched. */
export function sameHash(a: string | null, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index++) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${name.slice(0, 1)}${'•'.repeat(Math.max(2, name.length - 1))}@${domain}`
}

/**
 * Unknown addresses get a stable made up salt, so the response looks the same
 * whether or not the account exists.
 */
export async function fakeSalt(email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`salt:${email}`))
  return toBase64(new Uint8Array(digest).slice(0, 16))
}
