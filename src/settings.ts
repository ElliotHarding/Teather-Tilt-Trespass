/**
 * Global game settings, persisted to localStorage so choices survive reloads.
 * Import the `settings` object anywhere and read it live; call saveSettings()
 * after mutating it.
 */
export interface Settings {
  /**
   * true  → the orbiting ball STOPS when it swings into a wall (default).
   * false → the ball is clamped to the play field and slides along the edge,
   *         continuing to spin (the original in-bounds behaviour).
   */
  stopAtWalls: boolean;
}

// v2: reset persisted settings so the stop-at-walls default takes effect
// (supersedes any older bounds-mode value saved during testing).
const STORAGE_KEY = 'ttt-settings-v2';
const DEFAULTS: Settings = { stopAtWalls: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Ignore storage/parse errors and fall back to defaults.
  }
  return { ...DEFAULTS };
}

export const settings: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable (private mode); setting still applies in-memory.
  }
}
