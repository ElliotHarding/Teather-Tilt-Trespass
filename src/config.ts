/**
 * Central place for game-wide constants. Keeping these out of the scenes makes
 * them easy to tune during playtesting and keeps "magic numbers" in one spot.
 */

// Logical design resolution. The game is authored at this size; Phaser's Scale
// manager then fits it to whatever screen it runs on. Portrait 9:16 for mobile.
export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;

// Screen layout: a header bar and a footer bar hold all UI; the playfield is
// the region strictly between them, so UI never overlays the game. Levels are
// authored in field-local coordinates (0,0 = field top-left) and offset by the
// scene. FIELD_X is 0, so only Y is shifted.
export const HEADER_H = 96;
export const FOOTER_H = 132;
export const FIELD_X = 0;
export const FIELD_Y = HEADER_H;
export const FIELD_W = GAME_WIDTH;
export const FIELD_H = GAME_HEIGHT - HEADER_H - FOOTER_H;

// Downward gravity for the Matter world (Matter's own units). Only affects
// DYNAMIC bodies — launched balls (so they arc) and separated balls (they
// fall). The orbiting/resting pair is kinematic, so the swing stays
// predictable. Key difficulty knob: raise to arc harder, lower for floatier.
export const GRAVITY_Y = 0;
// Master switch for the tilt / gravity-steer mechanic (accelerometer + ←/→).
// Disabled: gravity stays un-steered so launches fly straight, and the mobile
// accelerometer-permission prompt (which interrupted the hold-to-launch
// gesture) is skipped. Flip to true to bring the Tilt mechanic back.
export const TILT_ENABLED = false;
// Tilt steers gravity.x between -TILT_MAX..+TILT_MAX, curving launches sideways.
export const TILT_MAX = 0.6;
// How fast the tilt eases toward its target, per second (keyboard ramp feel).
export const TILT_RAMP = 3.2;

// Thickness of the border walls, in pixels. Shared by the scene (which draws
// them) and the pair (which clamps the balls to stay inside them).
export const WALL_THICKNESS = 40;

// --- Tether / Swing tuning (the Teather mechanic) -------------------------
export const BALL_RADIUS = 16;
// Distance between the two balls — the fixed tether length, in pixels. Smaller
// = a more compact, maneuverable pair (launch reach is set by speed, not this).
export const TETHER_LENGTH = 85;
// How fast the orbiting ball sweeps around the pivot, in radians/second.
// Positive = clockwise on screen (y points down). ~2.6 ≈ 0.4 revs/sec.
export const ORBIT_SPEED = 2.6;

// --- Launch tuning --------------------------------------------------------
// Speed given to a launched ball, in Matter velocity units (~pixels per step).
export const LAUNCH_SPEED = 11;
// How fast the trailing ball reels toward a freshly stuck ball, in pixels/sec.
export const REEL_SPEED = 460;
// If a launched ball slows below this (Matter speed units) it is considered to
// have come to rest and sticks wherever it is — a safety net so the launch
// always resolves even if it never cleanly hits a wall.
export const LAUNCH_STOP_SPEED = 0.6;
// Max speed of a ball in flight (Matter units). Capped below the thinnest wall
// so gravity-accelerated shots can't tunnel straight through one.
export const LAUNCH_MAX_SPEED = 16;
// Press shorter than this (ms) = a tap (swap); longer = a hold (aim + launch).
export const HOLD_THRESHOLD_MS = 160;

export const COLORS = {
  background: 0x0e0e12,
  ball: 0x5ad1ff,
  pivot: 0xffd45a,
  tether: 0xaaaaaa,
  wall: 0x3a3a46,
  text: '#e8e8f0',
  buttonBg: 0x26263a,
  buttonActive: 0x3d3d5c,
  buttonText: '#e8e8f0',
  goal: 0x5aff8f,
  hazard: 0xff5a6a,
  enemy: 0xff7a3a,
  gem: 0xb98cff,
  star: 0xffd45a,
  gate: 0xffb14a, // closed gate wall (amber)
  pad: 0xff8a5a, // button pad, un-pressed
  padOn: 0x5aff8f, // button pad, pressed (matches the goal green)
} as const;

// Collectible gem radius, in pixels.
export const GEM_RADIUS = 13;

// Button pad radius, in pixels. Touching one with either ball opens its gate.
export const BUTTON_RADIUS = 18;
