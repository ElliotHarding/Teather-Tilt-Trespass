import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, GRAVITY_Y, COLORS } from './config';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { SettingsScene } from './scenes/SettingsScene';

/**
 * Entry point. Builds the single Phaser.Game instance and hands it the scene
 * list. Phaser runs scenes in array order: Boot → Preload → Game.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO, // WebGL if available, else Canvas
  parent: 'game', // the <div id="game"> in index.html
  backgroundColor: COLORS.background,
  scale: {
    mode: Phaser.Scale.FIT, // scale the logical canvas to fit the screen
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: GRAVITY_Y },
      // Flip to true while debugging to see bodies, constraints and velocities.
      debug: false,
    },
  },
  scene: [BootScene, PreloadScene, MenuScene, GameScene, SettingsScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
