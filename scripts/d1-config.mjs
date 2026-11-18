import { readFileSync, writeFileSync } from 'node:fs'

// `vite build` writes the resolved Worker config here. Fill the placeholder D1
// ids so the tracked wrangler.jsonc stays free of account ids.
const path = 'dist/worker/wrangler.json'

let config
try {
  config = JSON.parse(readFileSync(path, 'utf8'))
} catch {
  console.error(`Could not read ${path}. Run vite build first.`)
  process.exit(1)
}

const account = process.env.CLOUDFLARE_ACCOUNT_ID
const token = process.env.CLOUDFLARE_API_TOKEN
const canLookUp = Boolean(account && token)

// The list endpoint is paginated and its `name` filter is a partial match, so
// filter the results again and insist on exactly one database.
async function lookup(name) {
  const params = new URLSearchParams({ name, per_page: '100' })
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database?${params}`
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
  const body = await res.json().catch(() => null)

  if (!res.ok || !body?.success) {
    const reason = body?.errors?.[0]?.message ?? `HTTP ${res.status}`
    throw new Error(`D1 lookup for ${name} failed: ${reason}`)
  }

  const matches = (body.result ?? []).filter((database) => database.name === name)
  if (matches.length !== 1) {
    throw new Error(`Expected one database named ${name}, found ${matches.length}`)
  }

  return matches[0].uuid
}

async function fill(databases, envKeys) {
  const missing = []

  for (const database of databases) {
    const id = envKeys.map((key) => process.env[key]).find(Boolean)
    if (id) {
      database.database_id = id
      continue
    }

    if (canLookUp) {
      database.database_id = await lookup(database.database_name)
      continue
    }

    missing.push(database.database_name)
  }

  return missing
}

try {
  const prodMissing = await fill(config.d1_databases ?? [], [
    'D1_DATABASE_ID',
    'D1_ID',
  ])
  const previewMissing = await fill(config.previews?.d1_databases ?? [], [
    'D1_PREVIEW_DATABASE_ID',
    'D1_PREVIEW_ID',
  ])

  const missing = [...prodMissing, ...previewMissing]
  if (missing.length) {
    console.log(`No id for ${missing.join(', ')}. Leaving placeholders.`)

    // Print names only. Values may be secrets.
    const keys = Object.keys(process.env)
      .filter((key) => /d1|database|cloudflare|workers|build/i.test(key))
      .sort()
    console.log(`Build env has: ${keys.join(', ') || 'nothing matching'}`)
    process.exit(0)
  }

  writeFileSync(path, JSON.stringify(config))
  console.log('Filled D1 ids in dist/worker/wrangler.json')
} catch (error) {
  // With credentials in the env a lookup should never be guessed at. Fail the
  // build instead of deploying a placeholder id.
  console.error(error.message)
  process.exit(1)
}
