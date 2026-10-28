import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { settings, saveSettings } from '../settings';
import { Button } from '../ui/Button';

/**
 * Settings overlay. Launched on top of (and pausing) the Game scene. Toggles
 * are read live from the shared `settings` object, so changes take effect as
 * soon as the Game scene resumes.
 */
export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('Settings');
  }

  create(): void {
    // Dim + block clicks from reaching the paused game behind.
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setInteractive();

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.add.rectangle(cx, cy, 440, 300, 0x1a1a28).setStrokeStyle(2, COLORS.buttonActive);
    this.add
      .text(cx, cy - 100, 'Settings', {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: COLORS.text,
      })
      .setOrigin(0.5);

    // "Stop at walls" toggle.
    const toggle = new Button(this, cx, cy - 10, 360, 60, this.wallsLabel(), () => {
      settings.stopAtWalls = !settings.stopAtWalls;
      saveSettings();
      toggle.setText(this.wallsLabel());
    });

    new Button(this, cx, cy + 90, 200, 56, 'CLOSE', () => this.close());
  }

  private wallsLabel(): string {
    return `Stop at walls: ${settings.stopAtWalls ? 'ON' : 'OFF'}`;
  }

  private close(): void {
    const game = this.scene.get('Game');
    game.input.enabled = true;
    this.scene.resume('Game');
    this.scene.stop();
  }
}
