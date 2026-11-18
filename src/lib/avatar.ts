export type FaceLook = {
  base: string
  accent: string | null
  ink: string
  crescent: 'left' | 'top-left' | 'right' | 'none'
  smile: 'small' | 'medium' | 'big'
  eyeGap: number
  eyeY: number
  eyeSize: number
}

const YELLOW = '#f4c542'
const ORANGE = '#ef8b2c'
const TEAL = '#0d6b6b'
const CREAM = '#f2ecc9'
const DARK = '#153f3f'
const LIGHT = '#f6f0d6'

const BASES = [YELLOW, ORANGE, TEAL, CREAM]
const ACCENTS = [YELLOW, ORANGE, TEAL, CREAM]
const CRESCENTS = ['left', 'top-left', 'right'] as const
const SMILES: FaceLook['smile'][] = ['small', 'medium', 'big']

const GUEST_KEY = 'refs:guest'

/** FNV-1a, then xorshift so every seed keeps the same face. */
function makeRandom(seed: string): () => number {
  let state = 2166136261
  for (let index = 0; index < seed.length; index++) {
    state ^= seed.charCodeAt(index)
    state = Math.imul(state, 16777619)
  }

  state = (state >>> 0) || 1

  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}

function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.floor(random() * list.length)]
}

export function faceFromSeed(seed: string): FaceLook {
  const random = makeRandom(`${seed}:face`)
  const base = pick(BASES, random)
  const accent =
    random() > 0.3
      ? pick(
          ACCENTS.filter((color) => color !== base),
          random,
        )
      : null

  return {
    base,
    accent,
    ink: base === TEAL ? LIGHT : DARK,
    crescent: accent ? pick(CRESCENTS, random) : 'none',
    smile: pick(SMILES, random),
    eyeGap: 19 + random() * 4,
    eyeY: 42 + random() * 3,
    eyeSize: 2.3 + random() * 0.8,
  }
}

export function readGuestSeed(): string {
  try {
    const stored = localStorage.getItem(GUEST_KEY)
    if (stored) return stored

    const next = Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem(GUEST_KEY, next)
    return next
  } catch {
    return 'refs'
  }
}
