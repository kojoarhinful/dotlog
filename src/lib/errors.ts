/** Errors thrown by `api()` already carry a readable message. */
export function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
