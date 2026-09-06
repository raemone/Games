/**
 * Boot: wire the engine to the table and start the loop.
 */
import { Audio } from './engine/audio';
import { Input } from './engine/input';
import { Loop } from './engine/loop';
import { Renderer } from './engine/renderer';
import { Game } from './game/game';

function boot(): void {
  const app = document.getElementById('app');
  const bootMessage = document.getElementById('boot');
  if (!app) throw new Error('missing #app');

  const renderer = new Renderer(app);
  const input = new Input(renderer.canvas);
  const audio = new Audio();
  const game = new Game(renderer, input, audio);

  // Handy when poking at the table from the browser console. Dev builds only.
  if (import.meta.env.DEV) {
    (window as unknown as { game: Game }).game = game;
  }

  // Audio has to start from a real gesture, so the first touch or key unlocks it.
  const unlock = (): void => {
    audio.unlock();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  const onResize = (): void => game.resize();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  onResize();

  bootMessage?.classList.add('hidden');

  new Loop({
    update: () => game.update(),
    render: () => game.render(),
  }).start();
}

function showFailure(error: unknown): void {
  const bootMessage = document.getElementById('boot');
  if (!bootMessage) return;
  bootMessage.classList.remove('hidden');
  bootMessage.textContent = 'Roxy Pinball could not start. Try reloading.';
  // Keep the detail in the console for a grown-up, not on a child's screen.
  console.error(error);
}

try {
  boot();
} catch (error) {
  showFailure(error);
}

// The service worker is what makes the game installable and playable offline.
// A failure here is not worth interrupting play for.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline support is a bonus, not a requirement */
    });
  });
}
