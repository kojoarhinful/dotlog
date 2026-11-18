/**
 * D1 is the only storage. The types below are the small slice of the D1 API
 * this app uses, declared by hand so the front-end build does not have to pull
 * in the whole Workers type set next to the DOM libs.
 */

type D1Result<T> = { results: T[] }

export type D1Statement = {
  bind(...values: unknown[]): D1Statement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<D1Result<T>>
  run(): Promise<unknown>
}

export type D1 = {
  prepare(query: string): D1Statement
  batch<T = unknown>(statements: D1Statement[]): Promise<D1Result<T>[]>
}

type Assets = {
  fetch(input: URL | string, init?: RequestInit): Promise<Response>
}

export type Env = {
  DB: D1
  ASSETS: Assets
  AUTH_URL?: string
  EMAIL_FROM?: string
  BREVO_API_KEY?: string
}

/** One statement per entry, because D1 splits multi statement strings poorly. */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    emailVerified INTEGER,
    authSalt TEXT,
    authHash TEXT,
    authIterations INTEGER,
    kdfSalt TEXT,
    kdfIterations INTEGER,
    wrappedKey TEXT,
    recoveryHash TEXT,
    recoverySalt TEXT,
    recoveryIterations INTEGER,
    recoveryWrappedKey TEXT,
    createdAt INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    tokenHash TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    expires INTEGER NOT NULL,
    createdAt INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS auth_tokens (
    tokenHash TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS login_codes (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    codeHash TEXT NOT NULL,
    expires INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT NOT NULL,
    userId TEXT NOT NULL,
    data TEXT NOT NULL,
    updatedAt INTEGER NOT NULL,
    PRIMARY KEY (id, userId)
  )`,
  `CREATE TABLE IF NOT EXISTS branches (
    id TEXT NOT NULL,
    userId TEXT NOT NULL,
    data TEXT NOT NULL,
    updatedAt INTEGER NOT NULL,
    PRIMARY KEY (id, userId)
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    reset INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_rev (
    userId TEXT PRIMARY KEY,
    rev INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS bookmarks_by_user ON bookmarks(userId, updatedAt)',
  'CREATE INDEX IF NOT EXISTS branches_by_user ON branches(userId, updatedAt)',
  'CREATE INDEX IF NOT EXISTS sessions_by_user ON auth_sessions(userId)',
  'CREATE INDEX IF NOT EXISTS tokens_by_user ON auth_tokens(userId)',
]

/**
 * CREATE TABLE IF NOT EXISTS never adds columns to an existing table, so new
 * columns get their own statements. They run once per isolate after the schema
 * batch, and a duplicate column error just means the table is already current.
 */
const COLUMNS = [
  'ALTER TABLE users ADD COLUMN authIterations INTEGER',
  'ALTER TABLE users ADD COLUMN kdfIterations INTEGER',
  'ALTER TABLE users ADD COLUMN recoveryIterations INTEGER',
]

let ready: Promise<void> | null = null

/**
 * Workers have no migration step at boot, so the tables are created on the
 * first API request of each isolate and remembered afterwards.
 */
export function ensureSchema(db: D1): Promise<void> {
  ready ??= db
    .batch(SCHEMA.map((sql) => db.prepare(sql)))
    .then(async () => {
      for (const sql of COLUMNS) {
        await db.prepare(sql).run().catch(() => {})
      }
    })
    .catch((error: unknown) => {
      ready = null
      throw error
    })
  return ready
}
