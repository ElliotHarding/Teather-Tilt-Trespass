import Phaser from 'phaser';
import { COLORS } from '../config';

/**
 * A simple touch/click button: a rounded rectangle with a text label.
 *
 * The rectangle is the interactive hit target; the label sits on top but is NOT
 * interactive, so Phaser's `topOnly` input routing still treats the button as a
 * single target. Buttons live at a high depth so a press on them is captured
 * here and never reaches the full-screen gesture zone behind them.
 */
export class Button {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    onPress: () => void,
  ) {
    this.bg = scene.add.rectangle(x, y, width, height, COLORS.buttonBg);
    this.bg.setStrokeStyle(2, COLORS.buttonActive);
    this.bg.setDepth(1000);
    this.bg.setScrollFactor(0); // stay fixed when the world scrolls later
    this.bg.setInteractive({ useHandCursor: true });

    this.label = scene.add.text(x, y, text, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: COLORS.buttonText,
    });
    this.label.setOrigin(0.5, 0.5);
    this.label.setDepth(1001);
    this.label.setScrollFactor(0);

    this.bg.on('pointerdown', () => {
      this.bg.setFillStyle(COLORS.buttonActive);
      onPress();
    });
    this.bg.on('pointerup', () => this.bg.setFillStyle(COLORS.buttonBg));
    this.bg.on('pointerout', () => this.bg.setFillStyle(COLORS.buttonBg));
  }

  setText(text: string): void {
    this.label.setText(text);
  }

  /** Raise/lower the button; the label always sits one layer above its bg. */
  setDepth(depth: number): void {
    this.bg.setDepth(depth);
    this.label.setDepth(depth + 1);
  }
}
