import { Hono } from 'hono'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { D1, Env } from './db'
import {
  fakeSalt,
  maskEmail,
  normalizeCode,
  normalizeEmail,
  randomCode,
  randomId,
  randomToken,
  sameHash,
  sha256Hex,
} from './crypto'
import {
  sendDeleteCode,
  sendExistingAccount,
  sendLoginCode,
  sendRecoveryCode,
  sendSignupCode,
} from './mail'
import { configuredOrigin } from './origin'
import { DEFAULT_ITERATIONS, MIN_ITERATIONS } from '../shared/kdf'

const SESSION_COOKIE = 'dotlog_session'
const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const SIGNUP_MINUTES = 15
const RECOVERY_MINUTES = 15
const CODE_MINUTES = 5
const MAX_CODE_ATTEMPTS = 5
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_ITERATIONS = 10_000_000

type UserRow = {
  id: string
  email: string
  name: string | null
  emailVerified: number | null
  authSalt: string | null
  authHash: string | null
  authIterations: number | null
  kdfSalt: string | null
  kdfIterations: number | null
  wrappedKey: string | null
  recoveryHash: string | null
  recoverySalt: string | null
  recoveryIterations: number | null
  recoveryWrappedKey: string | null
  createdAt: number | null
}

type TokenRow = {
  tokenHash: string
  userId: string
  purpose: string
  expires: number
}

type App = { Bindings: Env; Variables: { user: UserRow } }

function findEmail(db: D1, email: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>()
}

function findId(db: D1, id: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>()
}

function publicUser(user: UserRow) {
  return { id: user.id, email: user.email, name: user.name }
}

function baseUrl(env: Env, request: Request): string {
  return configuredOrigin(env) ?? new URL(request.url).origin
}

function clientIp(c: Context<App>): string {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local'
  )
}

async function readBody(c: Context<App>): Promise<Record<string, unknown>> {
  try {
    const value = await c.req.json()
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Accepts a value that must arrive untouched, such as a derived key. */
function keyOf(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null
  if (!value || value.length > max) return null
  return value
}

/**
 * The browser picks the PBKDF2 count so it can be raised later without
 * locking anyone out. Bound it so a bad or hostile client cannot store a cost
 * that makes the account unusable.
 */
function iterationsOf(value: unknown): number | null {
  const count = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(count)) return null
  if (count < MIN_ITERATIONS || count > MAX_ITERATIONS) return null
  return count
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim()
  if (!clean || clean.length > max) return null
  return clean
}

type PasswordKeys = {
  authSalt: string
  authKey: string
  authIterations: number
  kdfSalt: string
  kdfIterations: number
  wrappedKey: string
}

type RecoveryKeys = {
  recoverySalt: string
  recoveryIterations: number
  recoveryWrappedKey: string
  recoveryHash: string
}

/** The password material that sign up, reset, and password change all send. */
function passwordKeys(body: Record<string, unknown>): PasswordKeys | null {
  const authSalt = keyOf(body.authSalt)
  const authKey = keyOf(body.authKey)
  const authIterations = iterationsOf(body.authIterations)
  const kdfSalt = keyOf(body.kdfSalt)
  const kdfIterations = iterationsOf(body.kdfIterations)
  const wrappedKey = keyOf(body.wrappedKey, 500)

  if (!authSalt || !authKey || !authIterations) return null
  if (!kdfSalt || !kdfIterations || !wrappedKey) return null

  return { authSalt, authKey, authIterations, kdfSalt, kdfIterations, wrappedKey }
}

function recoveryKeys(body: Record<string, unknown>): RecoveryKeys | null {
  const recoverySalt = keyOf(body.recoverySalt)
  const recoveryIterations = iterationsOf(body.recoveryIterations)
  const recoveryWrappedKey = keyOf(body.recoveryWrappedKey, 500)
  const recoveryHash = keyOf(body.recoveryHash)

  if (!recoverySalt || !recoveryIterations) return null
  if (!recoveryWrappedKey || !recoveryHash) return null

  return { recoverySalt, recoveryIterations, recoveryWrappedKey, recoveryHash }
}

async function savePassword(
  db: D1,
  userId: string,
  keys: PasswordKeys,
): Promise<void> {
  await db
    .prepare(
      `UPDATE users SET authSalt = ?, authHash = ?, authIterations = ?,
         kdfSalt = ?, kdfIterations = ?, wrappedKey = ? WHERE id = ?`,
    )
    .bind(
      keys.authSalt,
      await sha256Hex(keys.authKey),
      keys.authIterations,
      keys.kdfSalt,
      keys.kdfIterations,
      keys.wrappedKey,
      userId,
    )
    .run()
}

/**
 * Fixed window counter in D1, because Workers keep no state between requests
 * and an in-memory map would reset on every isolate.
 */
async function limited(
  db: D1,
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const now = Date.now()
  const row = await db
    .prepare('SELECT count, reset FROM rate_limits WHERE key = ?')
    .bind(key)
    .first<{ count: number; reset: number }>()

  if (!row || row.reset < now) {
    await db
      .prepare(
        `INSERT INTO rate_limits (key, count, reset) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET count = 1, reset = excluded.reset`,
      )
      .bind(key, now + windowMs)
      .run()

    if (Math.random() < 0.02) {
      await db.prepare('DELETE FROM rate_limits WHERE reset < ?').bind(now).run()
    }
    return false
  }

  await db
    .prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?')
    .bind(key)
    .run()
  return row.count + 1 > max
}

async function sessionUser(c: Context<App>): Promise<UserRow | null> {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return null

  const row = await c.env.DB.prepare(
    `SELECT users.* FROM auth_sessions
     JOIN users ON users.id = auth_sessions.userId
     WHERE auth_sessions.tokenHash = ? AND auth_sessions.expires > ?`,
  )
    .bind(await sha256Hex(token), Date.now())
    .first<UserRow>()

  return row ?? null
}

export const requireUser = createMiddleware<App>(async (c, next) => {
  const user = await sessionUser(c)
  if (!user) {
    // The browser clears its saved key when it sees this header.
    c.header('x-dotlog-session', 'expired')
    return c.json({ error: 'Sign in first.' }, 401)
  }
  c.set('user', user)
  await next()
})

async function startSession(c: Context<App>, userId: string): Promise<void> {
  const token = randomToken()
  const now = Date.now()

  await c.env.DB.prepare('DELETE FROM auth_sessions WHERE expires < ?').bind(now).run()
  await c.env.DB.prepare(
    'INSERT INTO auth_sessions (tokenHash, userId, expires, createdAt) VALUES (?, ?, ?, ?)',
  )
    .bind(await sha256Hex(token), userId, now + SESSION_MS, now)
    .run()

  setCookie(c, SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: true,
    maxAge: Math.floor(SESSION_MS / 1000),
  })
}

async function issueToken(
  db: D1,
  userId: string,
  purpose: string,
  minutes: number,
): Promise<string> {
  const token = randomToken()

  await db
    .prepare('DELETE FROM auth_tokens WHERE userId = ? AND purpose = ?')
    .bind(userId, purpose)
    .run()
  await db
    .prepare(
      'INSERT INTO auth_tokens (tokenHash, userId, purpose, expires) VALUES (?, ?, ?, ?)',
    )
    .bind(await sha256Hex(token), userId, purpose, Date.now() + minutes * 60_000)
    .run()

  return token
}

async function readToken(
  db: D1,
  token: string,
  purpose: string,
): Promise<TokenRow | null> {
  if (!token) return null
  return db
    .prepare('SELECT * FROM auth_tokens WHERE tokenHash = ? AND purpose = ? AND expires > ?')
    .bind(await sha256Hex(token), purpose, Date.now())
    .first<TokenRow>()
}

type CodeResult = { userId: string } | { error: string; status: 400 | 401 | 429 }

/**
 * Checks a six digit code and burns it on success. Sign up, sign in and
 * recovery all share the same table, so the rules stay in one place.
 */
async function takeCode(db: D1, challengeId: string, code: string): Promise<CodeResult> {
  if (!challengeId || code.length !== 6) {
    return { error: 'Enter the 6 digit code.', status: 400 }
  }

  const row = await db
    .prepare('SELECT * FROM login_codes WHERE id = ?')
    .bind(challengeId)
    .first<{ id: string; userId: string; codeHash: string; expires: number; attempts: number }>()

  if (!row || row.expires < Date.now()) {
    return { error: 'That code has expired. Start again.', status: 400 }
  }

  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    await db.prepare('DELETE FROM login_codes WHERE id = ?').bind(row.id).run()
    return { error: 'Too many tries. Start again.', status: 429 }
  }

  if (!sameHash(await sha256Hex(code), row.codeHash)) {
    await db
      .prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?')
      .bind(row.id)
      .run()
    return { error: 'That code is wrong.', status: 401 }
  }

  await db.prepare('DELETE FROM login_codes WHERE id = ?').bind(row.id).run()
  return { userId: row.userId }
}

/** Stores a fresh code and returns the challenge the browser answers with. */
async function startCode(
  db: D1,
  userId: string,
): Promise<{ id: string; code: string }> {
  const code = randomCode()
  const id = randomId()

  await db.prepare('DELETE FROM login_codes WHERE userId = ?').bind(userId).run()
  await db
    .prepare(
      'INSERT INTO login_codes (id, userId, codeHash, expires, attempts) VALUES (?, ?, ?, ?, 0)',
    )
    .bind(id, userId, await sha256Hex(code), Date.now() + CODE_MINUTES * 60_000)
    .run()

  return { id, code }
}

/** The browser proves the password with a derived key, never by sending it. */
async function matches(user: UserRow, authKey: string | null): Promise<boolean> {
  if (!authKey || !user.authHash) return false
  return sameHash(await sha256Hex(authKey), user.authHash)
}

export const authRoutes = new Hono<App>()

/** Gives the browser the salt it needs to derive the password verifier. */
authRoutes.get('/salt', async (c) => {
  const email = normalizeEmail(c.req.query('email') ?? '')
  if (!EMAIL.test(email)) {
    return c.json({ error: 'Enter a valid email address.' }, 400)
  }
  if (await limited(c.env.DB, `salt:${clientIp(c)}`, 60, 10 * 60_000)) {
    return c.json({ error: 'Too many tries. Wait a few minutes.' }, 429)
  }

  const user = await findEmail(c.env.DB, email)
  return c.json({
    authSalt: user?.authSalt ?? (await fakeSalt(email)),
    authIterations: user?.authIterations ?? DEFAULT_ITERATIONS,
  })
})

authRoutes.get('/session', async (c) => {
  const user = await sessionUser(c)
  c.header('cache-control', 'no-store')
  return c.json({ user: user ? publicUser(user) : null })
})

authRoutes.get('/key', requireUser, async (c) => {
  const user = c.var.user
  if (!user.kdfSalt || !user.wrappedKey) {
    return c.json({ error: 'This account has no password yet.' }, 409)
  }

  c.header('cache-control', 'no-store')
  return c.json({
    kdfSalt: user.kdfSalt,
    kdfIterations: user.kdfIterations ?? DEFAULT_ITERATIONS,
    wrappedKey: user.wrappedKey,
    authSalt: user.authSalt,
    authIterations: user.authIterations ?? DEFAULT_ITERATIONS,
  })
})

authRoutes.patch('/me', requireUser, async (c) => {
  const body = await readBody(c)
  if (body.name !== null && typeof body.name !== 'string') {
    return c.json({ error: 'Send a name.' }, 400)
  }

  const name =
    typeof body.name === 'string'
      ? body.name.trim().replace(/\s+/g, ' ').slice(0, 60) || null
      : null

  const user = c.var.user
  await c.env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, user.id).run()
  return c.json({ user: { ...publicUser(user), name } })
})

authRoutes.post('/signup', async (c) => {
  const body = await readBody(c)
  const email = normalizeEmail(String(body.email ?? ''))

  if (!EMAIL.test(email)) {
    return c.json({ error: 'Enter a valid email address.' }, 400)
  }
  if (await limited(c.env.DB, `signup:${email}`, 5, 10 * 60_000)) {
    return c.json({ error: 'Too many tries. Wait a few minutes.' }, 429)
  }

  const url = baseUrl(c.env, c.req.raw)
  let user = await findEmail(c.env.DB, email)

  if (user?.authHash) {
    await sendExistingAccount(c.env, email, `${url}/login`)
    return c.json({ existing: true })
  }

  if (!user) {
    const id = randomId()
    await c.env.DB.prepare(
      'INSERT INTO users (id, email, emailVerified, createdAt) VALUES (?, ?, NULL, ?)',
    )
      .bind(id, email, Date.now())
      .run()
    user = await findId(c.env.DB, id)
  }

  if (!user) {
    return c.json({ error: 'Could not create that account.' }, 500)
  }

  const challenge = await startCode(c.env.DB, user.id)
  await sendSignupCode(c.env, email, challenge.code, CODE_MINUTES)

  return c.json({ challengeId: challenge.id, email: maskEmail(email) })
})

authRoutes.post('/signup/verify', async (c) => {
  const body = await readBody(c)
  const result = await takeCode(
    c.env.DB,
    text(body.challengeId, 100) ?? '',
    normalizeCode(String(body.code ?? '')),
  )

  if ('error' in result) {
    return c.json({ error: result.error }, result.status)
  }

  const user = await findId(c.env.DB, result.userId)
  if (!user) {
    return c.json({ error: 'That account is gone. Sign up again.' }, 400)
  }
  if (user.authHash) {
    return c.json({ error: 'That account is already set up. Sign in.' }, 400)
  }

  const token = await issueToken(c.env.DB, user.id, 'signup', SIGNUP_MINUTES)
  return c.json({ token })
})

authRoutes.get('/signup/lookup', async (c) => {
  const token = c.req.query('token') ?? ''
  const row = await readToken(c.env.DB, token, 'signup')
  const user = row ? await findId(c.env.DB, row.userId) : null

  if (!row || !user || user.authHash) {
    return c.json({ error: 'That request expired. Start again.' }, 400)
  }

  c.header('cache-control', 'no-store')
  return c.json({ email: user.email })
})

authRoutes.post('/signup/complete', async (c) => {
  const body = await readBody(c)
  const token = keyOf(body.token, 500)
  const password = passwordKeys(body)
  const recovery = recoveryKeys(body)

  if (!token || !password || !recovery) {
    return c.json({ error: 'Missing encryption details.' }, 400)
  }

  const row = await readToken(c.env.DB, token, 'signup')
  const user = row ? await findId(c.env.DB, row.userId) : null
  if (!row || !user) {
    return c.json({ error: 'That request expired. Start again.' }, 400)
  }

  await c.env.DB.prepare(
    `UPDATE users SET authSalt = ?, authHash = ?, authIterations = ?,
       kdfSalt = ?, kdfIterations = ?, wrappedKey = ?,
       recoveryHash = ?, recoverySalt = ?, recoveryIterations = ?,
       recoveryWrappedKey = ?, emailVerified = ?
     WHERE id = ?`,
  )
    .bind(
      password.authSalt,
      await sha256Hex(password.authKey),
      password.authIterations,
      password.kdfSalt,
      password.kdfIterations,
      password.wrappedKey,
      recovery.recoveryHash,
      recovery.recoverySalt,
      recovery.recoveryIterations,
      recovery.recoveryWrappedKey,
      Date.now(),
      user.id,
    )
    .run()

  await c.env.DB.prepare('DELETE FROM auth_tokens WHERE userId = ?').bind(user.id).run()
  await startSession(c, user.id)

  return c.json({ user: publicUser(user) })
})

authRoutes.post('/login', async (c) => {
  const body = await readBody(c)
  const email = normalizeEmail(String(body.email ?? ''))
  const authKey = keyOf(body.authKey)

  if (await limited(c.env.DB, `login:${email}`, 10, 10 * 60_000)) {
    return c.json({ error: 'Too many tries. Wait a few minutes.' }, 429)
  }

  const user = await findEmail(c.env.DB, email)
  if (!user || !(await matches(user, authKey))) {
    return c.json({ error: 'That email and password do not match.' }, 401)
  }

  const challenge = await startCode(c.env.DB, user.id)
  await sendLoginCode(c.env, user.email, challenge.code, CODE_MINUTES)
  return c.json({ challengeId: challenge.id, email: maskEmail(user.email) })
})

authRoutes.post('/login/verify', async (c) => {
  const body = await readBody(c)
  const result = await takeCode(
    c.env.DB,
    text(body.challengeId, 100) ?? '',
    normalizeCode(String(body.code ?? '')),
  )

  if ('error' in result) {
    return c.json({ error: result.error }, result.status)
  }

  const user = await findId(c.env.DB, result.userId)
  if (!user) {
    return c.json({ error: 'That account is gone.' }, 400)
  }

  await startSession(c, user.id)
  return c.json({ user: publicUser(user) })
})

authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) {
    await c.env.DB.prepare('DELETE FROM auth_sessions WHERE tokenHash = ?')
      .bind(await sha256Hex(token))
      .run()
  }

  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

authRoutes.post('/password', requireUser, async (c) => {
  const body = await readBody(c)
  const currentKey = keyOf(body.currentKey)
  const keys = passwordKeys(body)

  if (!currentKey || !keys) {
    return c.json({ error: 'Missing encryption details.' }, 400)
  }

  const user = c.var.user
  if (!(await matches(user, currentKey))) {
    return c.json({ error: 'That password is wrong.' }, 401)
  }

  await savePassword(c.env.DB, user.id, keys)

  return c.json({ ok: true })
})

authRoutes.post('/delete/start', requireUser, async (c) => {
  const user = c.var.user
  if (!user.email) {
    return c.json({ error: 'That account has no email.' }, 400)
  }
  if (await limited(c.env.DB, `delete:${user.id}`, 5, 10 * 60_000)) {
    return c.json({ error: 'Too many tries. Wait a few minutes.' }, 429)
  }

  const challenge = await startCode(c.env.DB, user.id)
  await sendDeleteCode(c.env, user.email, challenge.code, CODE_MINUTES)
  return c.json({ challengeId: challenge.id, email: maskEmail(user.email) })
})

authRoutes.post('/delete', requireUser, async (c) => {
  const body = await readBody(c)
  const user = c.var.user
  const result = await takeCode(
    c.env.DB,
    String(body.challengeId ?? ''),
    normalizeCode(String(body.code ?? '')),
  )

  if ('error' in result) {
    return c.json({ error: result.error }, result.status)
  }
  if (result.userId !== user.id) {
    return c.json({ error: 'That code is not for this account.' }, 400)
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM bookmarks WHERE userId = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM branches WHERE userId = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM auth_sessions WHERE userId = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM auth_tokens WHERE userId = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM login_codes WHERE userId = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ])

  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

authRoutes.post('/recover', async (c) => {
  const body = await readBody(c)
  const email = normalizeEmail(String(body.email ?? ''))

  if (!EMAIL.test(email)) {
    return c.json({ error: 'Enter a valid email address.' }, 400)
  }
  if (await limited(c.env.DB, `recover:${email}`, 5, 10 * 60_000)) {
    return c.json({ error: 'Too many tries. Wait a few minutes.' }, 429)
  }

  const user = await findEmail(c.env.DB, email)
  if (!user?.authHash) {
    // Same shape as a real account so the reply does not reveal which emails
    // have an account. The code simply never arrives.
    return c.json({ challengeId: randomId(), email: maskEmail(email) })
  }

  const challenge = await startCode(c.env.DB, user.id)
  await sendRecoveryCode(c.env, email, challenge.code, CODE_MINUTES)

  return c.json({ challengeId: challenge.id, email: maskEmail(email) })
})

authRoutes.post('/recover/verify', async (c) => {
  const body = await readBody(c)
  const result = await takeCode(
    c.env.DB,
    text(body.challengeId, 100) ?? '',
    normalizeCode(String(body.code ?? '')),
  )

  if ('error' in result) {
    return c.json({ error: result.error }, result.status)
  }

  const user = await findId(c.env.DB, result.userId)
  if (!user || !user.recoverySalt || !user.recoveryWrappedKey) {
    return c.json({ error: 'That code is wrong.' }, 401)
  }

  const token = await issueToken(c.env.DB, user.id, 'recover', RECOVERY_MINUTES)
  return c.json({ token })
})

authRoutes.get('/recover/lookup', async (c) => {
  const token = c.req.query('token') ?? ''
  const row = await readToken(c.env.DB, token, 'recover')
  const user = row ? await findId(c.env.DB, row.userId) : null

  if (!row || !user || !user.recoverySalt || !user.recoveryWrappedKey) {
    return c.json({ error: 'That request expired. Start again.' }, 400)
  }

  c.header('cache-control', 'no-store')
  return c.json({
    email: user.email,
    recoverySalt: user.recoverySalt,
    recoveryIterations: user.recoveryIterations ?? DEFAULT_ITERATIONS,
    recoveryWrappedKey: user.recoveryWrappedKey,
  })
})

authRoutes.post('/recover/complete', async (c) => {
  const body = await readBody(c)
  const token = keyOf(body.token, 500)
  const recoveryKey = keyOf(body.recoveryKey)
  const keys = passwordKeys(body)

  if (!token || !recoveryKey || !keys) {
    return c.json({ error: 'Fill in every field.' }, 400)
  }

  const row = await readToken(c.env.DB, token, 'recover')
  const user = row ? await findId(c.env.DB, row.userId) : null
  if (!row || !user) {
    return c.json({ error: 'That request expired. Start again.' }, 400)
  }

  if (!sameHash(recoveryKey, user.recoveryHash)) {
    return c.json({ error: 'That recovery code is wrong.' }, 401)
  }

  await savePassword(c.env.DB, user.id, keys)

  await c.env.DB.prepare('DELETE FROM auth_tokens WHERE userId = ?').bind(user.id).run()
  await c.env.DB.prepare('DELETE FROM auth_sessions WHERE userId = ?').bind(user.id).run()
  await startSession(c, user.id)

  return c.json({ user: publicUser(user) })
})

/** Last resort: no recovery code, so the old data cannot be decrypted. Start clean. */
authRoutes.post('/recover/wipe', async (c) => {
  const body = await readBody(c)
  const token = keyOf(body.token, 500)
  const password = passwordKeys(body)
  const recovery = recoveryKeys(body)

  if (!token || !password || !recovery) {
    return c.json({ error: 'Missing encryption details.' }, 400)
  }

  const row = await readToken(c.env.DB, token, 'recover')
  const user = row ? await findId(c.env.DB, row.userId) : null
  if (!row || !user) {
    return c.json({ error: 'That request expired. Start again.' }, 400)
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM bookmarks WHERE userId = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM branches WHERE userId = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM auth_sessions WHERE userId = ?').bind(user.id),
  ])

  await c.env.DB.prepare(
    `UPDATE users SET authSalt = ?, authHash = ?, authIterations = ?,
       kdfSalt = ?, kdfIterations = ?, wrappedKey = ?,
       recoveryHash = ?, recoverySalt = ?, recoveryIterations = ?,
       recoveryWrappedKey = ?
     WHERE id = ?`,
  )
    .bind(
      password.authSalt,
      await sha256Hex(password.authKey),
      password.authIterations,
      password.kdfSalt,
      password.kdfIterations,
      password.wrappedKey,
      recovery.recoveryHash,
      recovery.recoverySalt,
      recovery.recoveryIterations,
      recovery.recoveryWrappedKey,
      user.id,
    )
    .run()

  await c.env.DB.prepare('DELETE FROM auth_tokens WHERE userId = ?').bind(user.id).run()
  await startSession(c, user.id)

  return c.json({ user: publicUser(user) })
})
