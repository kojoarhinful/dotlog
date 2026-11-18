import type { Env } from './db'

/** `AUTH_URL` without a trailing slash, or null when it is not set. */
export function configuredOrigin(env: Env): string | null {
  return env.AUTH_URL?.replace(/\/+$/, '') || null
}
