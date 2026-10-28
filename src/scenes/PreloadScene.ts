import Phaser from 'phaser';

/**
 * Preload: where all game assets (images, audio, atlases) are loaded. Anything
 * queued with this.load.* in preload() is fetched before create() runs, so the
 * Game scene can assume its assets exist.
 *
 * We have no external assets yet — the prototype draws everything with Phaser
 * graphics primitives — so this just forwards to the Game scene. It stays here
 * as the obvious home for loading once we add sprites and sound.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    // this.load.image('ball', 'assets/ball.png'); // ← later
  }

  create(): void {
    this.scene.start('Menu');
  }
}
