export type Stored = {
  id: string
  data: string
  updatedAt: number
}

type ErrorBody = { error?: string }

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  if (init.body) headers.set('content-type', 'application/json')

  const response = await fetch(path, {
    ...init,
    headers,
    cache: 'no-store',
    credentials: 'same-origin',
  })

  const body = (await response
    .json()
    .catch(() => ({}))) as T & ErrorBody

  if (!response.ok) {
    // requireUser marks a dead session so the app can drop the saved key.
    if (
      response.status === 401 &&
      response.headers.get('x-dotlog-session') === 'expired'
    ) {
      window.dispatchEvent(new Event('dotlog:signed-out'))
    }
    throw new Error(body.error ?? 'Something went wrong. Try again.')
  }

  return body as T
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export function put<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'PUT', body: JSON.stringify(body) })
}

export function patch<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
}

export function del<T>(path: string): Promise<T> {
  return api<T>(path, { method: 'DELETE' })
}
