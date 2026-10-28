import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  HEADER_H,
  FOOTER_H,
  FIELD_Y,
  FIELD_H,
  GRAVITY_Y,
  TILT_MAX,
  TILT_RAMP,
  HOLD_THRESHOLD_MS,
  WALL_THICKNESS,
  BALL_RADIUS,
  GEM_RADIUS,
  COLORS,
} from '../config';
import { TetherPair } from '../entities/TetherPair';
import { Button } from '../ui/Button';
import { LEVELS, type LevelData, type RectDef } from '../levels/levels';
import { recordStars } from '../progress';

interface Gem {
  x: number;
  y: number;
  obj: Phaser.GameObjects.Arc;
  collected: boolean;
}

interface GameSceneData {
  level?: number;
}

const CHROME = 0x15151f; // header/footer bar fill

/**
 * Game: the play scene.
 *
 * Layout: a header bar (title · launches · gear) and footer bar (hint · RESET ·
 * CUT) hold all UI. The playfield is the region strictly between them, so no
 * button or text ever sits on top of the game. Levels are authored in
 * field-local coordinates and offset by FIELD_Y here.
 *
 *   - tap field      → switch the rotating ball (swap pivot)
 *   - hold + release → aim + launch (sticks to border/interior walls)
 *   - CUT / Space    → cut the tether [experimental]
 *
 * Reach the green goal with either ball to clear the level; touch a red hazard
 * and it restarts. Win/lose are dim modal overlays.
 */
export class GameScene extends Phaser.Scene {
  private pair!: TetherPair;
  private launchText!: Phaser.GameObjects.Text;

  private levelIndex = 0;
  private level!: LevelData;
  /** Absolute (screen-space) geometry derived from the field-local level. */
  private hazards: RectDef[] = [];
  private goal!: LevelData['goal'];
  private wallRects: RectDef[] = [];
  private interiorWalls: RectDef[] = [];
  private zone!: Phaser.GameObjects.Zone;

  private gems: Gem[] = [];
  private gemCount = 0;
  private enemyObjs: Phaser.GameObjects.Arc[] = [];

  // Tilt (gravity.x steering).
  private tiltX = 0;
  private deviceTilt = 0; // -1..1 from the accelerometer
  private tiltAsked = false;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private orientationHandler?: (e: DeviceOrientationEvent) => void;
  private tiltIndicator!: Phaser.GameObjects.Graphics;

  private resolved = false;
  private pressStart: number | null = null;

  constructor() {
    super('Game');
  }

  init(data: GameSceneData): void {
    this.levelIndex = data.level ?? 0;
    this.resolved = false;
    this.pressStart = null;
    this.wallRects = [];
    this.gems = [];
    this.gemCount = 0;
    this.enemyObjs = [];
    this.tiltX = 0;
  }

  create(): void {
    this.level = LEVELS[this.levelIndex]!;

    // Field-local → screen space (only Y shifts; FIELD_X is 0).
    this.interiorWalls = this.level.walls.map((w) => this.toAbs(w));
    this.hazards = this.level.hazards.map((h) => this.toAbs(h));
    this.goal = { x: this.level.goal.x, y: this.level.goal.y + FIELD_Y, r: this.level.goal.r };
    const startX = this.level.start.x;
    const startY = this.level.start.y + FIELD_Y;

    this.createWalls();
    this.createHazards();
    this.createDeadlyWalls();
    this.createGoal();
    this.createGems();
    this.createEnemies();

    this.pair = new TetherPair(this, startX, startY, this.wallRects, this.interiorWalls);

    this.createChrome();
    this.wireInput();
    this.createButtons();
    this.setupTilt();
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.updateTilt(dt);

    if (this.pressStart !== null && this.now() - this.pressStart >= HOLD_THRESHOLD_MS) {
      this.pair.setAiming(true);
    }
    this.pair.update(delta);

    const gemStr = this.gems.length > 0 ? `   gems ${this.gemCount}/${this.gems.length}` : '';
    this.launchText.setText(`launches: ${this.pair.launches}${gemStr}`);

    if (!this.resolved) this.checkField();
  }

  private toAbs(r: RectDef): RectDef {
    return { x: r.x, y: r.y + FIELD_Y, w: r.w, h: r.h };
  }

  // --- win / lose ---------------------------------------------------------

  private checkField(): void {
    for (const p of this.pair.points) {
      // Gems first — collecting one shouldn't be pre-empted by a win/fail.
      for (const gem of this.gems) {
        if (gem.collected) continue;
        if (Phaser.Math.Distance.Between(p.x, p.y, gem.x, gem.y) < GEM_RADIUS + BALL_RADIUS) {
          gem.collected = true;
          this.gemCount += 1;
          this.popGem(gem.obj);
        }
      }

      for (const hz of this.hazards) {
        if (this.circleHitsRect(p.x, p.y, BALL_RADIUS, hz)) {
          this.fail();
          return;
        }
      }
      for (const en of this.enemyObjs) {
        if (Phaser.Math.Distance.Between(p.x, p.y, en.x, en.y) < en.radius + BALL_RADIUS) {
          this.fail();
          return;
        }
      }
      const d = Phaser.Math.Distance.Between(p.x, p.y, this.goal.x, this.goal.y);
      if (d < this.goal.r + BALL_RADIUS) {
        this.win();
        return;
      }
    }
  }

  private popGem(obj: Phaser.GameObjects.Arc): void {
    this.tweens.add({
      targets: obj,
      scale: 1.9,
      alpha: 0,
      duration: 180,
      onComplete: () => obj.destroy(),
    });
  }

  private win(): void {
    this.resolved = true;
    this.zone.disableInteractive();
    this.cameras.main.flash(300, 90, 255, 143);
    this.dimOverlay();

    // Stars: cleared (always) + all gems + under par.
    const allGems = this.gemCount >= this.gems.length;
    const underPar = this.pair.launches <= this.level.par;
    const stars = 1 + (allGems ? 1 : 0) + (underPar ? 1 : 0);
    recordStars(this.levelIndex, stars);

    const next = this.levelIndex + 1;
    const isLast = next >= LEVELS.length;

    this.starRow(stars);
    this.banner(isLast ? 'YOU WIN!' : 'LEVEL CLEAR');
    this.subText(
      `par ${this.level.par} · you ${this.pair.launches}` +
        (this.gems.length > 0 ? ` · gems ${this.gemCount}/${this.gems.length}` : ''),
    );

    const button = new Button(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 110,
      240,
      62,
      isLast ? 'PLAY AGAIN' : 'NEXT LEVEL ▶',
      () => this.restartLevel(isLast ? 0 : next),
    );
    button.setDepth(2100);
  }

  private starRow(stars: number): void {
    const text = '★★★☆☆☆'.slice(3 - stars, 6 - stars);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 110, text, {
        fontFamily: 'monospace',
        fontSize: '52px',
        color: '#ffd45a',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(2000);
  }

  private subText(text: string): void {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 24, text, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#b8b8c8',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(2000);
  }

  private fail(): void {
    this.resolved = true;
    this.zone.disableInteractive();
    this.cameras.main.flash(250, 255, 90, 106);
    this.cameras.main.shake(200, 0.012);
    this.dimOverlay();
    this.banner('OUCH — HAZARD');
    this.time.delayedCall(900, () => this.scene.restart({ level: this.levelIndex }));
  }

  private dimOverlay(): void {
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72)
      .setOrigin(0, 0)
      .setDepth(1500);
  }

  private banner(text: string): void {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, text, {
        fontFamily: 'monospace',
        fontSize: '36px',
        color: COLORS.text,
        align: 'center',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(2000);
  }

  /** Closest-point circle-vs-rectangle overlap test. */
  private circleHitsRect(cx: number, cy: number, r: number, rect: RectDef): boolean {
    const nearestX = Phaser.Math.Clamp(cx, rect.x - rect.w / 2, rect.x + rect.w / 2);
    const nearestY = Phaser.Math.Clamp(cy, rect.y - rect.h / 2, rect.y + rect.h / 2);
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    return dx * dx + dy * dy < r * r;
  }

  // --- level geometry (screen space) --------------------------------------

  private createWalls(): void {
    const t = WALL_THICKNESS;
    const top = FIELD_Y;
    const bottom = FIELD_Y + FIELD_H;
    const midY = FIELD_Y + FIELD_H / 2;

    this.addWall(GAME_WIDTH / 2, top + t / 2, GAME_WIDTH, t); // ceiling
    this.addWall(GAME_WIDTH / 2, bottom - t / 2, GAME_WIDTH, t); // floor
    this.addWall(t / 2, midY, t, FIELD_H); // left
    this.addWall(GAME_WIDTH - t / 2, midY, t, FIELD_H); // right

    for (const w of this.interiorWalls) this.addWall(w.x, w.y, w.w, w.h);
  }

  private addWall(x: number, y: number, w: number, h: number, color: number = COLORS.wall): void {
    const rect = this.add.rectangle(x, y, w, h, color);
    rect.setDepth(2); // above goal/hazards/gems so they clip under the walls
    this.matter.add.gameObject(rect, { isStatic: true, label: 'wall' });
    this.wallRects.push({ x, y, w, h });
  }

  private createHazards(): void {
    for (const hz of this.hazards) {
      const rect = this.add.rectangle(hz.x, hz.y, hz.w, hz.h, COLORS.hazard, 0.85);
      rect.setStrokeStyle(2, COLORS.hazard);
      this.tweens.add({ targets: rect, alpha: 0.5, duration: 600, yoyo: true, repeat: -1 });
    }
  }

  /** Deadly walls: solid (block + launches stick/stop) AND lethal on contact. */
  private createDeadlyWalls(): void {
    for (const w of this.level.deadlyWalls ?? []) {
      const abs = this.toAbs(w);
      this.addWall(abs.x, abs.y, abs.w, abs.h, COLORS.hazard); // solid, drawn red
      this.hazards.push(abs); // touching it fails the level
    }
  }

  /** Moving enemies that patrol between two points and kill on contact. */
  private createEnemies(): void {
    for (const e of this.level.enemies ?? []) {
      const ax = e.a.x;
      const ay = e.a.y + FIELD_Y;
      const bx = e.b.x;
      const by = e.b.y + FIELD_Y;
      const obj = this.add.circle(ax, ay, e.r, COLORS.enemy);
      obj.setStrokeStyle(2, 0xffffff, 0.35);
      obj.setDepth(3);
      const dist = Phaser.Math.Distance.Between(ax, ay, bx, by);
      this.tweens.add({
        targets: obj,
        x: bx,
        y: by,
        duration: (dist / e.speed) * 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
      this.enemyObjs.push(obj);
    }
  }

  private createGoal(): void {
    const ring = this.add.circle(this.goal.x, this.goal.y, this.goal.r, COLORS.goal, 0.25);
    ring.setStrokeStyle(3, COLORS.goal);
    const core = this.add.circle(this.goal.x, this.goal.y, this.goal.r * 0.45, COLORS.goal, 0.9);
    this.tweens.add({
      targets: [ring, core],
      scale: 1.15,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  private createGems(): void {
    this.gems = this.level.gems.map((p) => {
      const x = p.x;
      const y = p.y + FIELD_Y;
      const obj = this.add.circle(x, y, GEM_RADIUS, COLORS.gem);
      obj.setStrokeStyle(2, 0xffffff, 0.35);
      this.tweens.add({
        targets: obj,
        scale: 1.25,
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
      return { x, y, obj, collected: false };
    });
  }

  // --- tilt (gravity.x steering) ------------------------------------------

  private setupTilt(): void {
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.input.keyboard?.addCapture('LEFT,RIGHT');

    // Accelerometer on mobile. gamma is the left-right tilt in degrees.
    this.orientationHandler = (e: DeviceOrientationEvent) => {
      this.deviceTilt = Phaser.Math.Clamp((e.gamma ?? 0) / 40, -1, 1);
    };
    window.addEventListener('deviceorientation', this.orientationHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.orientationHandler) {
        window.removeEventListener('deviceorientation', this.orientationHandler);
      }
    });
  }

  /** iOS 13+ needs an explicit permission prompt, triggered by a user tap. */
  private ensureTiltPermission(): void {
    if (this.tiltAsked) return;
    this.tiltAsked = true;
    const doe = (
      window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }
    ).DeviceOrientationEvent;
    doe?.requestPermission?.().catch(() => {});
  }

  private updateTilt(dt: number): void {
    let target: number;
    if (this.cursors?.left.isDown) target = -TILT_MAX;
    else if (this.cursors?.right.isDown) target = TILT_MAX;
    else target = this.deviceTilt * TILT_MAX;

    // Ease toward the target so keyboard tilt feels like rolling, not snapping.
    this.tiltX += (target - this.tiltX) * Phaser.Math.Clamp(TILT_RAMP * dt, 0, 1);
    this.matter.world.setGravity(this.tiltX, GRAVITY_Y);
    this.drawTiltIndicator();
  }

  /** Small plumb-line in the header showing which way gravity currently pulls. */
  private drawTiltIndicator(): void {
    const cx = GAME_WIDTH / 2;
    const cy = HEADER_H / 2;
    const len = 16;
    const mag = Math.hypot(this.tiltX, GRAVITY_Y) || 1;
    const dx = (this.tiltX / mag) * len;
    const dy = (GRAVITY_Y / mag) * len;
    const g = this.tiltIndicator;
    g.clear();
    g.lineStyle(3, 0x6a6a82, 1);
    g.lineBetween(cx - dx, cy - dy, cx + dx, cy + dy);
    g.fillStyle(COLORS.star, 1);
    g.fillCircle(cx + dx, cy + dy, 4); // bob marks "down"
  }

  // --- chrome (header + footer bars) --------------------------------------

  private createChrome(): void {
    const footerTop = GAME_HEIGHT - FOOTER_H;

    // Bars + divider lines. Depth 900 keeps them above the playfield, but they
    // live outside it so they never cover gameplay.
    this.add.rectangle(0, 0, GAME_WIDTH, HEADER_H, CHROME).setOrigin(0, 0).setDepth(900);
    this.add.rectangle(0, HEADER_H - 2, GAME_WIDTH, 2, COLORS.buttonActive).setOrigin(0, 0).setDepth(900);
    this.add.rectangle(0, footerTop, GAME_WIDTH, FOOTER_H, CHROME).setOrigin(0, 0).setDepth(900);
    this.add.rectangle(0, footerTop, GAME_WIDTH, 2, COLORS.buttonActive).setOrigin(0, 0).setDepth(900);

    // Header: title (after the menu button) + launch counter (right, by gear).
    this.add
      .text(74, HEADER_H / 2, this.level.name, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: COLORS.text,
      })
      .setOrigin(0, 0.5)
      .setDepth(901);

    this.launchText = this.add
      .text(GAME_WIDTH - 86, HEADER_H / 2, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#9a9aae',
      })
      .setOrigin(1, 0.5)
      .setDepth(901);

    // Gravity/tilt plumb-line, centred in the header.
    this.tiltIndicator = this.add.graphics().setDepth(902);

    // Footer: controls hint above the buttons.
    this.add
      .text(GAME_WIDTH / 2, footerTop + 24, 'tap: spin / swap   ·   hold: launch   ·   ←/→ or tilt: steer', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#8a8a9a',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(901);
  }

  // --- input / buttons ----------------------------------------------------

  private wireInput(): void {
    // Gesture zone covers ONLY the playfield, so taps on the bars don't act.
    this.zone = this.add.zone(0, FIELD_Y, GAME_WIDTH, FIELD_H).setOrigin(0, 0);
    this.zone.setDepth(0);
    this.zone.setInteractive();

    this.zone.on('pointerdown', () => {
      this.ensureTiltPermission(); // first tap unlocks the accelerometer on iOS
      if (this.resolved || !this.pair.canAct()) return;
      this.pressStart = this.now();
    });

    this.zone.on('pointerup', () => {
      if (this.resolved) return;
      // Free-aim (after a cut): any tap fires along the sweeping aim line.
      if (this.pair.isFreeAiming()) {
        if (this.pair.fireAim()) this.cameras.main.shake(70, 0.006);
        this.pressStart = null;
        return;
      }
      if (this.pressStart === null) return;
      const held = this.now() - this.pressStart;
      this.pressStart = null;
      if (held >= HOLD_THRESHOLD_MS) {
        if (this.pair.launch()) this.cameras.main.shake(70, 0.006);
      } else {
        this.pair.swap();
      }
    });

    this.input.keyboard?.on('keydown-SPACE', () => this.pair.separate());
    this.input.keyboard?.on('keydown-R', () => this.restartLevel(this.levelIndex));
  }

  private createButtons(): void {
    const footerTop = GAME_HEIGHT - FOOTER_H;
    const by = footerTop + FOOTER_H / 2 + 8;
    const w = 150;
    const h = 56;

    new Button(this, 20 + w / 2, by, w, h, 'RESET', () => this.restartLevel(this.levelIndex));
    new Button(this, GAME_WIDTH - 20 - w / 2, by, w, h, 'CUT', () => this.pair.separate());
    // Header: menu button (far left) and gear (far right).
    new Button(this, 38, HEADER_H / 2, 48, 40, '☰', () => this.toMenu());
    new Button(this, GAME_WIDTH - 40, HEADER_H / 2, 56, 44, '⚙', () => this.openSettings());
  }

  private openSettings(): void {
    this.input.enabled = false;
    this.scene.pause();
    this.scene.launch('Settings');
  }

  /** Back to the level select. Deferred like restart to avoid a mid-event
   *  Matter teardown. */
  private toMenu(): void {
    this.time.delayedCall(0, () => this.scene.start('Menu'));
  }

  private now(): number {
    return this.time.now;
  }

  /**
   * Restart into a level, deferred to the next tick: restarting a Matter scene
   * synchronously from an input handler tears down the world mid-event and
   * freezes the game.
   */
  private restartLevel(level: number): void {
    this.time.delayedCall(0, () => this.scene.restart({ level }));
  }
}
