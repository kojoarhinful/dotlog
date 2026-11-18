import type { Branch } from './types'

export type FlatBranch = { branch: Branch; depth: number }

export function sortBranches(list: Branch[]): Branch[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name))
}

export function flattenBranches(
  branches: Branch[],
  parentId: string | null = null,
  depth = 0,
): FlatBranch[] {
  const out: FlatBranch[] = []
  for (const branch of branches) {
    if (branch.parentId !== parentId) continue
    out.push({ branch, depth })
    out.push(...flattenBranches(branches, branch.id, depth + 1))
  }
  return out
}

export function descendantsOf(branches: Branch[], id: string): Set<string> {
  const ids = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const branch of branches) {
      if (branch.parentId && ids.has(branch.parentId) && !ids.has(branch.id)) {
        ids.add(branch.id)
        grew = true
      }
    }
  }
  return ids
}
