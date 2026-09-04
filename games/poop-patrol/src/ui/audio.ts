/**
 * Small WebAudio noises, synthesised rather than loaded - nothing to download
 * and nothing to license.
 *
 * Browsers refuse to start audio outside a real gesture, so every method is a
 * no-op until `unlock()` runs from a tap or a keypress, and everything is
 * wrapped: a blocked or missing AudioContext must never break the page.
 */

type Wave = OscillatorType;

export class Sound {
  private context: AudioContext | null = null;
  private enabled = true;

  unlock(): void {
    if (this.context) {
      void this.context.resume().catch(() => undefined);
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.context = new Ctor();
    } catch {
      this.context = null;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** The satisfying one: a fast drop plus a short noise tail. */
  plop(): void {
    this.sweep('sine', 520, 165, 0.09, 0.22);
    this.noise(0.07, 0.05, 900);
  }

  unplop(): void {
    this.sweep('sine', 200, 430, 0.08, 0.13);
  }

  undo(): void {
    this.sweep('triangle', 300, 620, 0.14, 0.13);
  }

  badge(): void {
    this.arpeggio([523, 659, 784], 0.1, 0.18);
  }

  goal(): void {
    this.arpeggio([523, 659, 784, 1047], 0.12, 0.2);
  }

  private ready(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.context || this.context.state === 'closed') return null;
    return this.context;
  }

  private sweep(wave: Wave, from: number, to: number, seconds: number, gain: number): void {
    const context = this.ready();
    if (!context) return;

    try {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const volume = context.createGain();

      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(from, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + seconds);

      volume.gain.setValueAtTime(gain, now);
      volume.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

      oscillator.connect(volume).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + seconds + 0.02);
    } catch {
      // Never let a noise take the page down.
    }
  }

  private noise(seconds: number, gain: number, cutoff: number): void {
    const context = this.ready();
    if (!context) return;

    try {
      const now = context.currentTime;
      const frames = Math.max(1, Math.floor(context.sampleRate * seconds));
      const buffer = context.createBuffer(1, frames, context.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < frames; index += 1) {
        // Fade the noise out across the buffer so it reads as a tail, not a hiss.
        channel[index] = (Math.random() * 2 - 1) * (1 - index / frames);
      }

      const source = context.createBufferSource();
      source.buffer = buffer;

      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;

      const volume = context.createGain();
      volume.gain.setValueAtTime(gain, now);
      volume.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

      source.connect(filter).connect(volume).connect(context.destination);
      source.start(now);
    } catch {
      // As above.
    }
  }

  private arpeggio(notes: readonly number[], step: number, gain: number): void {
    const context = this.ready();
    if (!context) return;

    try {
      const start = context.currentTime;
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const volume = context.createGain();
        const at = start + index * step;

        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(frequency, at);
        volume.gain.setValueAtTime(0.0001, at);
        volume.gain.exponentialRampToValueAtTime(gain, at + 0.02);
        volume.gain.exponentialRampToValueAtTime(0.0001, at + step + 0.12);

        oscillator.connect(volume).connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + step + 0.15);
      });
    } catch {
      // As above.
    }
  }
}
