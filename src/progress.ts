/**
 * Per-level best-star progress, persisted to localStorage. Stars are 0..3.
 */
const STORAGE_KEY = 'ttt-progress';

type StarsByLevel = Record<number, number>;

function load(): StarsByLevel {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StarsByLevel;
  } catch {
    // Ignore storage/parse errors.
  }
  return {};
}

const bestStars: StarsByLevel = load();

export function getBestStars(level: number): number {
  return bestStars[level] ?? 0;
}

/** Record a run's star count, keeping only the best, and persist it. */
export function recordStars(level: number, stars: number): void {
  if (stars <= getBestStars(level)) return;
  bestStars[level] = stars;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bestStars));
  } catch {
    // Storage may be unavailable; progress still applies in-memory.
  }
}
