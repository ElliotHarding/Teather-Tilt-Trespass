/**
 * Level definitions — data only, so levels are easy to add and tune without
 * touching scene code.
 *
 * Coordinates are FIELD-LOCAL: (0,0) is the top-left of the playfield, which is
 * FIELD_W × FIELD_H. The scene offsets them to screen space. Rectangles are
 * centre-based ({x,y} is the middle). The border walls are added by the scene
 * automatically; `walls` here are extra *interior* walls that launched balls
 * also stick to. `hazards` are deadly zones (no physics body — touching one
 * with either ball fails the level). Reach `goal` with either ball to win.
 */

export interface RectDef {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A moving enemy patrolling between points a and b at `speed` px/sec. */
export interface EnemyDef {
  a: Point;
  b: Point;
  r: number;
  speed: number;
}

/**
 * A button pad and the gate it controls. The gate starts as a solid wall
 * (blocks movement and launches stick to it); the first time either ball
 * touches the pad, the gate opens permanently and that path clears.
 */
export interface GateButtonDef {
  /** Button pad centre (field-local). */
  button: Point;
  /** Gate wall (field-local) that opens when the button is pressed. */
  gate: RectDef;
}

export interface LevelData {
  name: string;
  start: Point;
  goal: { x: number; y: number; r: number };
  walls: RectDef[];
  hazards: RectDef[];
  /** Launch count for the efficiency star (clear in <= par). */
  par: number;
  /** Optional collectible gem positions (field-local). */
  gems: Point[];
  /** Solid wall segments that ALSO kill on contact ("bad walls"). */
  deadlyWalls?: RectDef[];
  /** Moving enemies that kill on contact. */
  enemies?: EnemyDef[];
  /** Button pads that open their gate wall when touched. */
  buttons?: GateButtonDef[];
}

// Field-local coords. Playfield is FIELD_W (540) × FIELD_H (732); usable area
// for ball centres is roughly x 62..478, y 62..670 (inside the border walls).
export const LEVELS: LevelData[] = [
  {
    name: '1 · Lift Off',
    start: { x: 270, y: 630 },
    goal: { x: 270, y: 90, r: 55 },
    walls: [],
    hazards: [],
    par: 2,
    gems: [],
  },
  {
    name: '2 · Detour',
    start: { x: 110, y: 630 },
    goal: { x: 430, y: 90, r: 55 },
    walls: [],
    hazards: [{ x: 270, y: 350, w: 110, h: 22 }],
    par: 3,
    gems: [{ x: 430, y: 420 }],
  },
  {
    name: '3 · Ledge',
    start: { x: 270, y: 640 },
    goal: { x: 120, y: 90, r: 52 },
    walls: [{ x: 200, y: 380, w: 160, h: 22 }],
    hazards: [],
    par: 3,
    gems: [{ x: 420, y: 300 }],
  },
  {
    name: '4 · Pillars',
    start: { x: 110, y: 640 },
    goal: { x: 430, y: 100, r: 50 },
    walls: [
      { x: 215, y: 430, w: 22, h: 150 },
      { x: 345, y: 250, w: 22, h: 150 },
    ],
    hazards: [],
    par: 4,
    gems: [
      { x: 110, y: 360 },
      { x: 430, y: 500 },
    ],
  },
  {
    name: '5 · Crossroads',
    start: { x: 270, y: 640 },
    goal: { x: 270, y: 90, r: 50 },
    walls: [
      { x: 160, y: 500, w: 150, h: 20 },
      { x: 380, y: 300, w: 150, h: 20 },
    ],
    hazards: [{ x: 275, y: 400, w: 64, h: 64 }],
    par: 5,
    gems: [
      { x: 110, y: 420 },
      { x: 430, y: 220 },
    ],
  },
  {
    name: '6 · Hot Bar',
    start: { x: 270, y: 640 },
    goal: { x: 270, y: 90, r: 55 },
    walls: [],
    hazards: [],
    // A deadly bar across the middle — wide gaps on both sides to swing around.
    deadlyWalls: [{ x: 270, y: 400, w: 170, h: 22 }],
    par: 4,
    gems: [{ x: 270, y: 240 }],
  },
  {
    name: '7 · Patrol',
    start: { x: 110, y: 650 },
    goal: { x: 430, y: 90, r: 55 },
    walls: [],
    hazards: [],
    // Narrow central patrol — clear lanes down both sides.
    enemies: [{ a: { x: 200, y: 320 }, b: { x: 340, y: 320 }, r: 16, speed: 110 }],
    par: 4,
    gems: [{ x: 270, y: 560 }],
  },
  {
    name: '8 · Crossfire',
    start: { x: 270, y: 650 },
    goal: { x: 270, y: 90, r: 52 },
    walls: [{ x: 270, y: 500, w: 100, h: 20 }],
    hazards: [],
    // Two small, slow patrols in staggered bands — gaps to slip through.
    enemies: [
      { a: { x: 120, y: 360 }, b: { x: 240, y: 360 }, r: 14, speed: 105 },
      { a: { x: 300, y: 250 }, b: { x: 420, y: 250 }, r: 14, speed: 105 },
    ],
    par: 5,
    gems: [{ x: 430, y: 420 }],
  },
  {
    name: '9 · Finale',
    start: { x: 110, y: 650 },
    goal: { x: 430, y: 90, r: 52 },
    walls: [],
    hazards: [],
    deadlyWalls: [{ x: 200, y: 300, w: 140, h: 22 }],
    enemies: [{ a: { x: 430, y: 520 }, b: { x: 430, y: 340 }, r: 16, speed: 110 }],
    par: 6,
    gems: [{ x: 120, y: 320 }],
  },
  {
    name: '10 · Gatekeeper',
    start: { x: 110, y: 640 },
    goal: { x: 270, y: 90, r: 52 },
    walls: [],
    hazards: [],
    // A gate seals off the goal (both edge gaps too narrow for a ball). Brush
    // the wall-mounted pad in the lower chamber to open it, then launch up.
    buttons: [{ button: { x: 468, y: 560 }, gate: { x: 270, y: 300, w: 400, h: 22 } }],
    par: 4,
    gems: [{ x: 270, y: 430 }],
  },
];
