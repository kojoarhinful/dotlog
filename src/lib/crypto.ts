/**
 * Everything a bookmark contains is encrypted in the browser before it is sent
 * to the server. The server only ever sees ciphertext and a wrapped data key.
 *
 * Envelope: a random data key encrypts the records, and a key derived from the
 * password (or the recovery code) wraps that data key. Changing a password only
 * re-wraps the data key, so the archive is never re-encrypted.
 */

import {
  DEFAULT_ITERATIONS,
  MIN_ITERATIONS,
} from '../../shared/kdf'

export { DEFAULT_ITERATIONS }

const LEGACY_KEY_STORE = 'dotlog:dek'
const KEY_DB = 'dotlog'
const KEY_STORE = 'keys'
const KEY_ID = 'dek'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

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

function concat(
  a: Uint8Array<ArrayBuffer>,
  b: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(a.length + b.length))
  bytes.set(a)
  bytes.set(b, a.length)
  return bytes
}

export function generateSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)))
}

export function generateDataKey(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32))
}

export async function deriveKek(
  password: string,
  salt: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<CryptoKey> {
  // A hostile server could try to make the browser derive a cheap key.
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS) {
    throw new Error('This device will not accept those key settings.')
  }

  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(salt),
      iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * What the server receives instead of the password. Same PBKDF2 cost as the
 * wrapping key, but a different salt, so the two keys are unrelated.
 */
export async function deriveAuthKey(
  password: string,
  salt: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<string> {
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS) {
    throw new Error('This device will not accept those key settings.')
  }

  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: fromBase64(salt),
      iterations,
      hash: 'SHA-256',
    },
    material,
    256,
  )

  return toBase64(new Uint8Array(bits))
}

export async function wrapDataKey(
  kek: CryptoKey,
  raw: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, raw)
  return toBase64(concat(iv, new Uint8Array(wrapped)))
}

export async function unwrapDataKey(
  kek: CryptoKey,
  wrapped: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = fromBase64(wrapped)
  const iv = bytes.slice(0, 12)
  const body = bytes.slice(12)
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek, body)
  return new Uint8Array(raw)
}

export async function importDataKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    fromBase64(raw),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptRecord(
  key: CryptoKey,
  value: unknown,
  aad: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const body = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
    key,
    encoder.encode(JSON.stringify(value)),
  )
  return toBase64(concat(iv, new Uint8Array(body)))
}

export async function decryptRecord<T>(
  key: CryptoKey,
  value: string,
  aad: string,
): Promise<T> {
  const bytes = fromBase64(value)
  const iv = bytes.slice(0, 12)
  const body = bytes.slice(12)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
    key,
    body,
  )
  return JSON.parse(decoder.decode(plain)) as T
}

export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return (hex.match(/.{4}/g) ?? []).join('-')
}

export function normalizeRecoveryCode(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

export async function recoveryHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(normalizeRecoveryCode(value)),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

/**
 * The unlocked key lives in memory and in IndexedDB so a reload or a trip to
 * another app on a phone does not ask for the password again. The stored key is
 * non-extractable: page code can use it, but cannot copy the raw bytes out.
 * It is cleared on sign out and whenever the server says the session expired.
 */
let memoryKey: CryptoKey | null = null

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KEY_DB, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(KEY_STORE)) {
        request.result.createObjectStore(KEY_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transact(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  return openKeyDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(KEY_STORE, mode)
        const request = run(tx.objectStore(KEY_STORE))
        tx.oncomplete = () => {
          db.close()
          resolve(request.result)
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
        tx.onabort = () => {
          db.close()
          reject(tx.error ?? new Error('The key store closed.'))
        }
      }),
  )
}

export async function adoptDataKey(raw: string): Promise<void> {
  memoryKey = await importDataKey(raw)
  try {
    await transact('readwrite', (store) => store.put(memoryKey, KEY_ID))
  } catch {
    // Private mode can refuse storage. The key still works until a reload.
  }
  try {
    localStorage.removeItem(LEGACY_KEY_STORE)
  } catch {
    // Nothing to clear.
  }
}

export function dataKey(): CryptoKey {
  if (!memoryKey) throw new Error('The log is locked.')
  return memoryKey
}

export async function restoreDataKey(): Promise<boolean> {
  if (memoryKey) return true

  try {
    const stored = (await transact('readonly', (store) =>
      store.get(KEY_ID),
    )) as CryptoKey | undefined
    if (stored) {
      memoryKey = stored
      return true
    }
  } catch {
    // Fall through to the old localStorage copy, if there is one.
  }

  try {
    const legacy = localStorage.getItem(LEGACY_KEY_STORE)
    if (!legacy) return false
    await adoptDataKey(legacy)
    return true
  } catch {
    return false
  }
}

export function forgetDataKey(): void {
  memoryKey = null
  void transact('readwrite', (store) => store.delete(KEY_ID)).catch(() => {})
  try {
    localStorage.removeItem(LEGACY_KEY_STORE)
  } catch {
    // Nothing to clear.
  }
}
