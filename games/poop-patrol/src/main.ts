/**
 * Boot: wire up the app and get out of the way.
 */

import { App } from './ui/app';
import { Sound } from './ui/audio';
import { Effects } from './ui/effects';
import { requireElement } from './ui/dom';

function boot(): void {
  const container = requireElement('app');
  const layer = requireElement('fx');
  const bootMessage = document.getElementById('boot');

  const sound = new Sound();
  const effects = new Effects(layer);
  const app = new App(container, effects, sound);

  // Browsers only allow audio to start from a real gesture.
  const unlock = (): void => {
    sound.unlock();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  app.start();
  bootMessage?.classList.add('hidden');
}

function showFailure(error: unknown): void {
  const bootMessage = document.getElementById('boot');
  if (bootMessage) {
    bootMessage.classList.remove('hidden');
    bootMessage.textContent = 'Poop Patrol could not start. Try reloading.';
  }
  // The detail belongs in the console for a grown-up, not on the screen.
  console.error(error);
}

try {
  boot();
} catch (error) {
  showFailure(error);
}

// The service worker is what makes this installable and usable in a backyard
// with no signal. A failure here is not worth interrupting anyone for.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline support is a bonus, not a requirement */
    });
  });
}
