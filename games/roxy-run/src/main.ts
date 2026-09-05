/**
 * Boot: load the sprite sheets, wire up the engine, and start the loop.
 */
import { Audio } from './engine/audio';
import { Input } from './engine/input';
import { Loop } from './engine/loop';
import { Renderer } from './engine/renderer';
import { Game } from './game/game';
import { Sprites } from './game/sprites';

async function boot(): Promise<void> {
  const app = document.getElementById('app');
  const bootMessage = document.getElementById('boot');
  if (!app) throw new Error('missing #app');

  const renderer = new Renderer(app);
  const input = new Input(renderer.canvas);
  const audio = new Audio();
  const sprites = await Sprites.load();

  const game = new Game(renderer, input, audio, sprites);

  // Handy when poking at the game from the browser console. Dev builds only.
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
  bootMessage.textContent = 'Roxy could not start. Try reloading.';
  // Keep the detail in the console for a grown-up, not on a child's screen.
  console.error(error);
}

boot().catch(showFailure);

// The service worker is what makes the game installable and playable offline.
// A failure here is not worth interrupting play for.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        // Ask again whenever the game comes back to the foreground. An
        // installed game on a tablet can go weeks without a cold start, and
        // until it checks it keeps running whatever it was last given.
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) void registration.update();
        });
      })
      .catch(() => {
        /* offline support is a bonus, not a requirement */
      });
  });

  /**
   * Reload once when a new worker takes over.
   *
   * Fetching the new version is not the same as running it: the page carries
   * on with the code it started with until something reloads it. That gap is
   * how a tablet ends up playing by rules the server has already moved past -
   * and the player has no way to know, because everything looks fine.
   *
   * The flag is what stops the reload from happening again on the way back up.
   */
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}
