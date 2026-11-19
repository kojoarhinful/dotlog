import type { D1 } from './db'

/**
 * Fixed window counter in D1, because Workers keep no state between requests
 * and an in-memory map would reset on every isolate.
 */
export async function limited(
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
