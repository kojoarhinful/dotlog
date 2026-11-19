import { Hono } from 'hono'
import { authRoutes } from './auth'
import { dataRoutes } from './data'
import { ensureSchema } from './db'
import type { Env } from './db'
import { sha256Hex } from './crypto'
import { fetchMetadata } from './metadata'
import { configuredOrigin } from './origin'
import { limited } from './rate'

type App = { Bindings: Env }

const app = new Hono<App>()

/**
 * Every API request gets the tables and a same origin check. D1 has no boot
 * hook, so the schema is made on the first request of each isolate.
 */
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('origin')
    if (origin) {
      const allowed = configuredOrigin(c.env) ?? new URL(c.req.url).origin
      try {
        if (new URL(origin).origin !== new URL(allowed).origin) {
          return c.json({ error: 'Wrong origin.' }, 403)
        }
      } catch {
        return c.json({ error: 'Wrong origin.' }, 403)
      }
    }
  }

  await ensureSchema(c.env.DB)
  await next()
})

app.route('/api/auth', authRoutes)
app.route('/api/data', dataRoutes)

// The link is read once and passed back. Nothing here writes to D1 and the URL
// stays in the request body, so it does not land in access logs either.
app.post('/api/metadata', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { url?: unknown }
  if (typeof body.url !== 'string') {
    return c.json({ error: 'Send a url.' }, 400)
  }

  const address = c.req.header('cf-connecting-ip') ?? 'unknown'
  const key = `preview:${await sha256Hex(address)}`
  if (await limited(c.env.DB, key, 60, 10 * 60_000)) {
    return c.json({ error: 'Too many links. Wait a few minutes.' }, 429)
  }

  c.header('cache-control', 'no-store')

  try {
    return c.json(await fetchMetadata(body.url))
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Could not read that link.' },
      422,
    )
  }
})

app.notFound((c) => c.json({ error: 'Not found.' }, 404))

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: 'Something went wrong.' }, 500)
})

export default app
