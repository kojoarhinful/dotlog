import { Hono } from 'hono'
import type { D1, D1Statement, Env } from './db'
import { requireUser } from './auth'

type App = { Bindings: Env; Variables: { user: { id: string } } }

type Row = { id: string; data: string; updatedAt: number }

const TABLES = ['bookmarks', 'branches'] as const
type Kind = (typeof TABLES)[number]

/**
 * The server stores whatever the browser gives it. With encryption on, that
 * blob is ciphertext and the server cannot read a single link.
 */

function kindOf(value: string): Kind | null {
  return TABLES.includes(value as Kind) ? (value as Kind) : null
}

/** Ciphertext grows faster than plain text, so the cap is generous. */
const MAX_DATA = 500_000

function updatedAtOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now()
}

/**
 * A revision that only moves forward, so another device can tell whether it
 * needs to pull. `updatedAt` alone cannot see a delete of an old record.
 */
async function versionOf(db: D1, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT rev FROM user_rev WHERE userId = ?')
    .bind(userId)
    .first<{ rev: number }>()
  return row?.rev ?? 0
}

function bump(db: D1, userId: string): D1Statement {
  return db
    .prepare(
      `INSERT INTO user_rev (userId, rev) VALUES (?, ?)
       ON CONFLICT(userId) DO UPDATE SET rev = max(excluded.rev, user_rev.rev + 1)`,
    )
    .bind(userId, Date.now())
}

export const dataRoutes = new Hono<App>()

dataRoutes.use('*', requireUser)

dataRoutes.get('/version', async (c) => {
  c.header('cache-control', 'no-store')
  return c.json({ version: await versionOf(c.env.DB, c.var.user.id) })
})

dataRoutes.get('/', async (c) => {
  const userId = c.var.user.id
  // One batch so the rows and the revision describe the same saved state.
  const [bookmarks, branches, revisions] = await c.env.DB.batch<
    Row & { rev?: number }
  >([
    c.env.DB.prepare(
      'SELECT id, data, updatedAt FROM bookmarks WHERE userId = ? ORDER BY updatedAt ASC',
    ).bind(userId),
    c.env.DB.prepare(
      'SELECT id, data, updatedAt FROM branches WHERE userId = ? ORDER BY updatedAt ASC',
    ).bind(userId),
    c.env.DB.prepare('SELECT rev FROM user_rev WHERE userId = ?').bind(userId),
  ])

  c.header('cache-control', 'no-store')
  return c.json({
    bookmarks: bookmarks.results,
    branches: branches.results,
    version: revisions.results[0]?.rev ?? 0,
  })
})

dataRoutes.put('/:kind/:id', async (c) => {
  const kind = kindOf(c.req.param('kind'))
  if (!kind) return c.json({ error: 'Unknown collection.' }, 404)

  const body = (await c.req.json().catch(() => ({}))) as {
    data?: unknown
    updatedAt?: unknown
  }
  if (typeof body.data !== 'string' || body.data.length > MAX_DATA) {
    return c.json({ error: 'Send the record.' }, 400)
  }

  const updatedAt = updatedAtOf(body.updatedAt)

  const userId = c.var.user.id
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO ${kind} (id, userId, data, updatedAt) VALUES (?, ?, ?, ?)
       ON CONFLICT(id, userId) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt
       WHERE excluded.updatedAt >= ${kind}.updatedAt`,
    ).bind(c.req.param('id'), userId, body.data, updatedAt),
    bump(c.env.DB, userId),
  ])

  return c.json({ ok: true })
})

dataRoutes.delete('/:kind/:id', async (c) => {
  const kind = kindOf(c.req.param('kind'))
  if (!kind) return c.json({ error: 'Unknown collection.' }, 404)

  const userId = c.var.user.id
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM ${kind} WHERE id = ? AND userId = ?`).bind(
      c.req.param('id'),
      userId,
    ),
    bump(c.env.DB, userId),
  ])

  return c.json({ ok: true })
})

dataRoutes.post('/import', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    bookmarks?: unknown
    branches?: unknown
  }
  const userId = c.var.user.id

  const write = async (kind: Kind, value: unknown): Promise<number> => {
    if (!Array.isArray(value)) return 0

    let count = 0
    const statements = []

    for (const item of value) {
      if (!item || typeof item !== 'object') continue
      const row = item as { id?: unknown; data?: unknown; updatedAt?: unknown }
      if (typeof row.id !== 'string' || typeof row.data !== 'string') continue
      if (row.data.length > MAX_DATA) continue

      const updatedAt = updatedAtOf(row.updatedAt)

      statements.push(
        c.env.DB.prepare(
          `INSERT INTO ${kind} (id, userId, data, updatedAt) VALUES (?, ?, ?, ?)
           ON CONFLICT(id, userId) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`,
        ).bind(row.id, userId, row.data, updatedAt),
      )
      count += 1
    }

    if (statements.length > 0) {
      await c.env.DB.batch([...statements, bump(c.env.DB, userId)])
    }
    return count
  }

  const bookmarks = await write('bookmarks', body.bookmarks)
  const branches = await write('branches', body.branches)

  return c.json({ imported: { bookmarks, branches } })
})
