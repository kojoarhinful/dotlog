export type LinkMetadata = {
  url: string
  title: string
  description: string
  favicon: string
  siteName: string
}

export async function readLink(url: string): Promise<LinkMetadata> {
  const response = await fetch('/api/metadata', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })

  const data = (await response.json().catch(() => ({}))) as
    | LinkMetadata
    | { error?: string }

  if (!response.ok) {
    throw new Error('error' in data && data.error ? data.error : 'Could not fetch that remote.')
  }

  return data as LinkMetadata
}
