import Phaser from 'phaser';
import { GAME_WIDTH, COLORS } from '../config';
import { LEVELS } from '../levels/levels';
import { getBestStars } from '../progress';

/**
 * Level-select menu. Shows every level as a card with its best-star score and
 * starts the Game scene at that level on tap.
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    this.add
      .text(GAME_WIDTH / 2, 70, 'Teather · Tilt · Trespass', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: COLORS.text,
      })
      .setOrigin(0.5, 0.5);
    this.add
      .text(GAME_WIDTH / 2, 104, 'select a level', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#8a8a9a',
      })
      .setOrigin(0.5, 0.5);

    const cols = 2;
    const cardW = 210;
    const cardH = 84;
    const gapX = 24;
    const top = 170;
    const rowH = 100;
    const totalW = cols * cardW + (cols - 1) * gapX;
    const left = (GAME_WIDTH - totalW) / 2 + cardW / 2;

    LEVELS.forEach((level, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = left + col * (cardW + gapX);
      const y = top + row * rowH;
      this.makeCard(x, y, cardW, cardH, level.name, getBestStars(i), i);
    });
  }

  private makeCard(
    x: number,
    y: number,
    w: number,
    h: number,
    name: string,
    best: number,
    index: number,
  ): void {
    const card = this.add.rectangle(x, y, w, h, COLORS.buttonBg);
    card.setStrokeStyle(2, COLORS.buttonActive);
    card.setInteractive({ useHandCursor: true });

    this.add
      .text(x, y - 14, name, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: COLORS.text,
      })
      .setOrigin(0.5, 0.5);

    const stars = '★★★☆☆☆'.slice(3 - best, 6 - best);
    this.add
      .text(x, y + 16, stars, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffd45a',
      })
      .setOrigin(0.5, 0.5);

    card.on('pointerover', () => card.setFillStyle(COLORS.buttonActive));
    card.on('pointerout', () => card.setFillStyle(COLORS.buttonBg));
    card.on('pointerdown', () => this.scene.start('Game', { level: index }));
  }
}
