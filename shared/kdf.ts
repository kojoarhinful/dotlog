/**
 * PBKDF2-SHA256 rounds for the password verifier and the data key wrapper.
 * Both the browser and the Worker read these, so they cannot drift apart.
 */
export const DEFAULT_ITERATIONS = 600_000
export const MIN_ITERATIONS = 600_000
