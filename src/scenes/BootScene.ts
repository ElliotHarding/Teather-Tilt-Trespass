import Phaser from 'phaser';

/**
 * Boot: the very first scene. In a bigger game this is where you'd load the
 * tiny set of assets needed by the loading screen itself (a logo, a progress
 * bar sprite). We have none yet, so it just hands straight off to Preload.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Preload');
  }
}
