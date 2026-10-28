import Phaser from 'phaser';
import {
  FIELD_X,
  FIELD_Y,
  FIELD_W,
  FIELD_H,
  WALL_THICKNESS,
  BALL_RADIUS,
  TETHER_LENGTH,
  ORBIT_SPEED,
  LAUNCH_SPEED,
  LAUNCH_STOP_SPEED,
  LAUNCH_MAX_SPEED,
  REEL_SPEED,
  COLORS,
} from '../config';
import { settings } from '../settings';
import type { RectDef } from '../levels/levels';

/**
 * A Phaser Arc that has been given a Matter body via matter.add.gameObject.
 * Phaser injects the physics component methods at runtime, so we assert the
 * ones we use here.
 */
type MatterArc = Phaser.GameObjects.Arc & {
  body: MatterJS.BodyType;
  setVelocity(x: number, y?: number): MatterArc;
  setStatic(value: boolean): MatterArc;
};

const WALL_LABEL = 'wall';

// Inner play bounds (within the field region), used only by the clamp
// (settings.stopAtWalls === false) path to keep a kinematic ball in-field.
const MIN_X = FIELD_X + WALL_THICKNESS + BALL_RADIUS;
const MAX_X = FIELD_X + FIELD_W - WALL_THICKNESS - BALL_RADIUS;
const MIN_Y = FIELD_Y + WALL_THICKNESS + BALL_RADIUS;
const MAX_Y = FIELD_Y + FIELD_H - WALL_THICKNESS - BALL_RADIUS;

/** Where in the launch loop the pair currently is. */
const enum State {
  /** Pivot fixed, orbiter sweeping. Can swap or launch. */
  Orbiting,
  /** Orbiter cut loose and flying; waiting to hit a wall. */
  Launched,
  /** Flying ball stuck to a wall; trailing ball reeling in toward it. */
  Reeling,
  /** Stopped (hit a wall, or reeled in) — not spinning until the player taps. */
  Resting,
  /** Tether cut: free-aim mode — a line sweeps around the ball; tap to fire. */
  FreeAim,
}

/**
 * TetherPair — Teather + Launch.
 *
 * Orbiting: one ball (pivot) is a frozen anchor, the other sweeps around it.
 *   - tap   → swap which ball is the pivot, resuming the spin from the new
 *             geometry (also the way to restart after a stop)
 *   - hold  → freeze to aim; release launches the orbiter along its tangent.
 *             It sticks to the first wall, becomes the anchor, and the trailing
 *             ball reels in — then the pair comes to a full stop.
 *   - cut   → free-aim: an aim line sweeps around the ball; tap fires it in
 *             that (any) direction. After it sticks, normal play resumes.
 *
 * When settings.stopAtWalls is true (default) the orbit STOPS the instant the
 * ball swings into any wall; when false the ball is clamped to the field and
 * slides along the edge, continuing to spin.
 */
export class TetherPair {
  private readonly scene: Phaser.Scene;
  /** All walls (border + interior) — solid in stop-at-walls mode. */
  private readonly walls: RectDef[];
  /** Interior walls only — solid in BOTH modes (bounds mode clamps the border
   *  but must still treat in-field blocks as solid). */
  private readonly interiorWalls: RectDef[];
  private readonly ballA: MatterArc;
  private readonly ballB: MatterArc;
  private readonly tether: Phaser.GameObjects.Graphics;
  private readonly aimLine: Phaser.GameObjects.Graphics;

  private pivotIsA = true;
  private angle = 0;
  /** Sweep direction: +1 or -1. Auto-picked on resume to avoid walls. */
  private direction: 1 | -1 = 1;
  private state: State = State.Orbiting;
  private aiming = false;
  /** Free-aim sweep angle (radians), used in FreeAim mode after a cut. */
  private aimAngle = 0;

  /** Number of launches fired — the score the brief wants to minimise. */
  launches = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    walls: RectDef[],
    interiorWalls: RectDef[],
  ) {
    this.scene = scene;
    this.walls = walls;
    this.interiorWalls = interiorWalls;
    // Depths: walls sit at 2 (over goal/gems); the pair draws above the walls.
    this.tether = scene.add.graphics().setDepth(4);
    this.aimLine = scene.add.graphics().setDepth(6);

    this.ballA = this.makeBall(x, y, COLORS.pivot);
    this.ballB = this.makeBall(x + TETHER_LENGTH, y, COLORS.ball);

    scene.matter.world.on('collisionstart', this.onCollision, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // World may already be torn down during a restart — guard before off().
      scene.matter?.world?.off('collisionstart', this.onCollision, this);
    });

    this.redraw();
  }

  /** Current centre of each ball — used by the scene for goal/hazard tests. */
  get points(): ReadonlyArray<{ x: number; y: number }> {
    return [
      { x: this.ballA.x, y: this.ballA.y },
      { x: this.ballB.x, y: this.ballB.y },
    ];
  }

  private makeBall(x: number, y: number, color: number): MatterArc {
    const arc = this.scene.add.circle(x, y, BALL_RADIUS, color) as MatterArc;
    arc.setDepth(5); // in front of the walls
    this.scene.matter.add.gameObject(arc, {
      shape: { type: 'circle', radius: BALL_RADIUS },
      isStatic: true,
      frictionAir: 0,
    });
    return arc;
  }

  private get pivot(): MatterArc {
    return this.pivotIsA ? this.ballA : this.ballB;
  }

  private get orbiter(): MatterArc {
    return this.pivotIsA ? this.ballB : this.ballA;
  }

  /** True when the pair accepts tap/hold input (spinning or stopped). */
  canAct(): boolean {
    return this.state === State.Orbiting || this.state === State.Resting;
  }

  /** Hold-to-aim: while aiming the orbit freezes and the aim line is shown. */
  setAiming(value: boolean): void {
    if (!this.canAct()) return;
    this.aiming = value;
    if (!value) this.aimLine.clear();
  }

  /**
   * Tap: swap which ball is the pivot and (re)start the spin from the new
   * geometry. Works both while spinning and from a stop — swapping onto a
   * wall-mounted ball lets the other ball swing freely away from the wall.
   */
  swap(): void {
    if (!this.canAct()) return;
    this.pivotIsA = !this.pivotIsA;
    this.reseedAngle();
    this.chooseStartDirection();
    this.aiming = false;
    this.aimLine.clear();
    this.state = State.Orbiting;
  }

  /**
   * Hold-release: cut the tether and fling the orbiter along its tangent.
   * Works while spinning or from a stop. Returns true if a launch fired.
   */
  launch(): boolean {
    if (!this.canAct()) return false;
    const dir = this.tangent();
    const flyer = this.orbiter;
    flyer.setStatic(false);
    flyer.setVelocity(dir.x * LAUNCH_SPEED, dir.y * LAUNCH_SPEED);
    this.launches += 1;
    this.aiming = false;
    this.aimLine.clear();
    this.state = State.Launched;
    return true;
  }

  /** True while in free-aim mode (after a cut), waiting for a tap to fire. */
  isFreeAiming(): boolean {
    return this.state === State.FreeAim;
  }

  /**
   * Cut the tether and enter free-aim: both balls hold position while an aim
   * line sweeps around the orbiter. fireAim() then launches it in that
   * direction (any direction, unlike the tangent-only hold launch).
   */
  separate(): void {
    if (!this.canAct()) return;
    this.aimAngle = this.angle;
    this.aiming = false;
    this.aimLine.clear();
    this.state = State.FreeAim;
  }

  /** Fire the free-aim launch along the current sweep angle. */
  fireAim(): boolean {
    if (this.state !== State.FreeAim) return false;
    const flyer = this.orbiter;
    flyer.setStatic(false);
    flyer.setVelocity(
      Math.cos(this.aimAngle) * LAUNCH_SPEED,
      Math.sin(this.aimAngle) * LAUNCH_SPEED,
    );
    this.launches += 1;
    this.aimLine.clear();
    this.state = State.Launched;
    return true;
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;

    switch (this.state) {
      case State.Orbiting:
        if (!this.aiming) this.angle += this.direction * ORBIT_SPEED * dt;
        this.placeOrbiter();
        if (this.aiming) this.drawAim();
        break;

      case State.Launched: {
        const o = this.orbiter;
        // Anti-tunnelling: if a shot ever slips past a border wall, snap it back
        // to the field edge and stick it instead of letting it fly off-screen.
        if (o.x < MIN_X || o.x > MAX_X || o.y < MIN_Y || o.y > MAX_Y) {
          o.setPosition(
            Phaser.Math.Clamp(o.x, MIN_X, MAX_X),
            Phaser.Math.Clamp(o.y, MIN_Y, MAX_Y),
          );
          this.stick();
          break;
        }
        this.capSpeed(o); // keep it slow enough not to tunnel a thin wall
        // Safety net: if it stops without a clean wall hit, stick it anyway.
        if (this.speedOf(o) < LAUNCH_STOP_SPEED) this.stick();
        break;
      }

      case State.Reeling:
        this.reel(dt);
        break;

      case State.Resting:
        this.recolor();
        if (this.aiming) this.drawAim();
        break;

      case State.FreeAim:
        this.aimAngle += ORBIT_SPEED * dt; // the sweeping clock hand
        this.recolor();
        this.drawFreeAim();
        break;
    }

    this.redraw();
  }

  // --- internals ----------------------------------------------------------

  /** Tangent unit vector in the direction of travel at the current angle. */
  private tangent(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      -Math.sin(this.angle) * this.direction,
      Math.cos(this.angle) * this.direction,
    );
  }

  private speedOf(ball: MatterArc): number {
    const v = ball.body.velocity;
    return Math.hypot(v.x, v.y);
  }

  private capSpeed(ball: MatterArc): void {
    const v = ball.body.velocity;
    const s = Math.hypot(v.x, v.y);
    if (s > LAUNCH_MAX_SPEED) {
      ball.setVelocity((v.x / s) * LAUNCH_MAX_SPEED, (v.y / s) * LAUNCH_MAX_SPEED);
    }
  }

  private placeOrbiter(): void {
    const t = this.orbiterTarget(this.angle);
    if (this.isBlocked(t.x, t.y)) {
      // Ran into a solid wall — stop at the last good spot and wait for a tap.
      this.reseedAngle();
      this.state = State.Resting;
      this.recolor();
      return;
    }
    this.orbiter.setPosition(t.x, t.y);
    this.recolor();
  }

  /**
   * Where the orbiter would sit at `angle`. In bounds mode the point is clamped
   * to the field so the orbiter slides along the border instead of stopping at
   * it; in stop mode the raw point is used (the border stops it via isBlocked).
   */
  private orbiterTarget(angle: number): { x: number; y: number } {
    const pivot = this.pivot;
    let x = pivot.x + Math.cos(angle) * TETHER_LENGTH;
    let y = pivot.y + Math.sin(angle) * TETHER_LENGTH;
    if (!settings.stopAtWalls) {
      x = Phaser.Math.Clamp(x, MIN_X, MAX_X);
      y = Phaser.Math.Clamp(y, MIN_Y, MAX_Y);
    }
    return { x, y };
  }

  /**
   * True if a ball at (x,y) overlaps a solid wall. Stop mode treats every wall
   * (border + interior) as solid; bounds mode handles the border via clamping,
   * so only interior blocks count here — but either way interior blocks are
   * never passable.
   */
  private isBlocked(x: number, y: number): boolean {
    const walls = settings.stopAtWalls ? this.walls : this.interiorWalls;
    for (const w of walls) {
      const nx = Phaser.Math.Clamp(x, w.x - w.w / 2, w.x + w.w / 2);
      const ny = Phaser.Math.Clamp(y, w.y - w.h / 2, w.y + w.h / 2);
      const dx = x - nx;
      const dy = y - ny;
      if (dx * dx + dy * dy < BALL_RADIUS * BALL_RADIUS) return true;
    }
    return false;
  }

  private reel(dt: number): void {
    const anchor = this.pivot; // the freshly stuck ball
    const ball = this.orbiter; // the trailing ball being pulled in
    const dx = anchor.x - ball.x;
    const dy = anchor.y - ball.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= TETHER_LENGTH + 0.001) {
      // Settled at tether length — come to a full stop. A tap restarts it.
      this.reseedAngle();
      this.state = State.Resting;
      return;
    }

    const step = Math.min(REEL_SPEED * dt, dist - TETHER_LENGTH);
    ball.setPosition(ball.x + (dx / dist) * step, ball.y + (dy / dist) * step);
    this.recolor();
  }

  private reseedAngle(): void {
    const pivot = this.pivot;
    const orbiter = this.orbiter;
    this.angle = Math.atan2(orbiter.y - pivot.y, orbiter.x - pivot.x);
  }

  /**
   * On resume, pick the sweep direction that moves the orbiter into open space
   * rather than straight back into a wall — this is what frees the pair when
   * both balls have come to rest against walls. Keeps the current direction if
   * it is already clear.
   */
  private chooseStartDirection(): void {
    const flip: 1 | -1 = this.direction === 1 ? -1 : 1;

    // If the current angle is already clear, keep it (no jump); just pick a
    // direction that stays clear one step ahead.
    const cur = this.orbiterTarget(this.angle);
    if (!this.isBlocked(cur.x, cur.y)) {
      for (const dir of [this.direction, flip] as const) {
        const t = this.orbiterTarget(this.angle + dir * 0.14);
        if (!this.isBlocked(t.x, t.y)) {
          this.direction = dir;
          return;
        }
      }
      return;
    }

    // Current angle is blocked (ball against a wall) — scan outward for the
    // nearest clear angle in either direction and jump the orbiter there so it
    // swings off the wall instead of staying stuck.
    const step = 0.1;
    const maxSteps = Math.ceil(Math.PI / step);
    for (let i = 1; i <= maxSteps; i++) {
      for (const dir of [this.direction, flip] as const) {
        const a = this.angle + dir * step * i;
        const t = this.orbiterTarget(a);
        if (!this.isBlocked(t.x, t.y)) {
          this.angle = a;
          this.direction = dir;
          return;
        }
      }
    }
    // Fully cornered — RESET/CUT can escape.
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    if (this.state !== State.Launched) return;
    const flyerBody = this.orbiter.body;

    for (const pair of event.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      const hitWall =
        (a === flyerBody && b.label === WALL_LABEL) ||
        (b === flyerBody && a.label === WALL_LABEL);
      if (hitWall) {
        this.stick();
        return;
      }
    }
  }

  /** Freeze the flying ball where it struck; it becomes the new anchor. */
  private stick(): void {
    const flyer = this.orbiter;
    flyer.setVelocity(0, 0);
    flyer.setStatic(true);
    this.pushOutOfWalls(flyer);
    this.pivotIsA = flyer === this.ballA;
    this.state = State.Reeling;
    this.recolor();
  }

  /**
   * Nudge a just-stuck ball out to the wall surface so it isn't buried — a fast
   * launch penetrates a little before the collision fires. Two passes resolve a
   * corner (overlapping two walls).
   */
  private pushOutOfWalls(ball: MatterArc): void {
    for (let pass = 0; pass < 2; pass++) {
      for (const w of this.walls) {
        const left = w.x - w.w / 2;
        const right = w.x + w.w / 2;
        const top = w.y - w.h / 2;
        const bottom = w.y + w.h / 2;
        const nx = Phaser.Math.Clamp(ball.x, left, right);
        const ny = Phaser.Math.Clamp(ball.y, top, bottom);
        const dx = ball.x - nx;
        const dy = ball.y - ny;
        const d = Math.hypot(dx, dy);
        if (d >= BALL_RADIUS) continue;

        if (d > 0.001) {
          const push = BALL_RADIUS - d;
          ball.setPosition(ball.x + (dx / d) * push, ball.y + (dy / d) * push);
        } else {
          // Centre is inside the rect — eject along the shallowest axis.
          const outL = ball.x - left + BALL_RADIUS;
          const outR = right - ball.x + BALL_RADIUS;
          const outT = ball.y - top + BALL_RADIUS;
          const outB = bottom - ball.y + BALL_RADIUS;
          const min = Math.min(outL, outR, outT, outB);
          if (min === outL) ball.setPosition(left - BALL_RADIUS, ball.y);
          else if (min === outR) ball.setPosition(right + BALL_RADIUS, ball.y);
          else if (min === outT) ball.setPosition(ball.x, top - BALL_RADIUS);
          else ball.setPosition(ball.x, bottom + BALL_RADIUS);
        }
      }
    }
  }

  private recolor(): void {
    this.pivot.setFillStyle(COLORS.pivot);
    this.orbiter.setFillStyle(COLORS.ball);
  }

  private redraw(): void {
    this.tether.clear();
    // Tether is severed in free-aim — don't draw the link.
    if (this.state === State.FreeAim) return;
    this.tether.lineStyle(3, COLORS.tether, 0.9);
    this.tether.lineBetween(this.ballA.x, this.ballA.y, this.ballB.x, this.ballB.y);
  }

  private drawAim(): void {
    const o = this.orbiter;
    const dir = this.tangent();
    const len = 70;
    this.aimLine.clear();
    this.aimLine.lineStyle(2, COLORS.ball, 0.5);
    this.aimLine.lineBetween(o.x, o.y, o.x + dir.x * len, o.y + dir.y * len);
  }

  /** Sweeping aim line + end marker for free-aim mode. */
  private drawFreeAim(): void {
    const o = this.orbiter;
    const len = 90;
    const ex = o.x + Math.cos(this.aimAngle) * len;
    const ey = o.y + Math.sin(this.aimAngle) * len;
    this.aimLine.clear();
    this.aimLine.lineStyle(3, COLORS.ball, 0.9);
    this.aimLine.lineBetween(o.x, o.y, ex, ey);
    this.aimLine.fillStyle(COLORS.ball, 1);
    this.aimLine.fillCircle(ex, ey, 6);
  }
}
