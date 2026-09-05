/**
 * All sound is synthesised at runtime - there are no audio files to download,
 * license or wait for, which keeps the whole game a couple of hundred KB.
 *
 * Browsers refuse to start an AudioContext without a user gesture, so nothing
 * here works until `unlock()` is called from a tap or key press. Every method
 * is safe to call before that; they simply do nothing.
 */

export type Sfx =
  | 'jump'
  | 'bone'
  | 'spring'
  | 'hurt'
  | 'bop'
  | 'checkpoint'
  | 'goal'
  | 'extraLife'
  | 'spindash'
  | 'star'
  | 'select';

/** How often the note scheduler wakes up, and how far ahead it queues. */
const SCHEDULER_MS = 25;
const LOOKAHEAD_SECONDS = 0.12;

/** Semitone offsets from A4 for one octave, for writing melodies readably. */
const NOTES: Readonly<Record<string, number>> = {
  C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4,
  'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2,
};

/** Turn 'A4' or 'C#5' into a frequency in Hz. */
function freq(note: string): number {
  const match = /^([A-G]#?)(\d)$/.exec(note);
  if (!match) return 440;
  const semitone = NOTES[match[1] as string] ?? 0;
  const octave = Number(match[2]) - 4;
  return 440 * Math.pow(2, semitone / 12 + octave);
}

export interface Tune {
  /** Beats per minute. */
  readonly bpm: number;
  /** Lead melody, one entry per eighth note. null is a rest. */
  readonly lead: readonly (string | null)[];
  /** Bass line, one entry per quarter note. */
  readonly bass: readonly (string | null)[];
}

export class Audio {
  muted = false;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private tune: Tune | null = null;
  private timer: number | null = null;
  private step = 0;
  private nextNoteTime = 0;

  /** Call from a real user gesture, or the browser will refuse to make sound. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.28;
      this.musicGain.connect(this.master);
    } catch {
      // No audio available. The game is entirely playable without it.
      this.ctx = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  play(sfx: Sfx): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;

    switch (sfx) {
      case 'jump':
        this.blip('square', 220, 520, t, 0.14, 0.2);
        break;
      case 'bone':
        this.blip('sine', 880, 1320, t, 0.06, 0.22);
        this.blip('sine', 1320, 1760, t + 0.05, 0.07, 0.18);
        break;
      case 'spring':
        this.blip('sawtooth', 260, 900, t, 0.22, 0.22);
        break;
      case 'hurt':
        this.blip('square', 420, 90, t, 0.32, 0.24);
        break;
      case 'bop':
        this.noise(t, 0.09, 0.16);
        this.blip('square', 660, 220, t, 0.12, 0.16);
        break;
      case 'checkpoint':
        this.blip('triangle', 660, 660, t, 0.1, 0.2);
        this.blip('triangle', 990, 990, t + 0.1, 0.16, 0.2);
        break;
      case 'goal':
        ['C5', 'E5', 'G5', 'C6'].forEach((note, i) => {
          this.blip('square', freq(note), freq(note), t + i * 0.11, 0.2, 0.2);
        });
        break;
      case 'extraLife':
        ['G4', 'C5', 'E5', 'G5', 'E5', 'G5'].forEach((note, i) => {
          this.blip('triangle', freq(note), freq(note), t + i * 0.09, 0.14, 0.18);
        });
        break;
      case 'spindash':
        this.blip('sawtooth', 120, 700, t, 0.25, 0.16);
        break;
      case 'star':
        // A rising arpeggio - the same shape as the extra-life jingle but
        // brighter and quicker, so the two are not confused.
        ['E5', 'A5', 'C#6', 'E6', 'A6'].forEach((note, i) => {
          this.blip('square', freq(note), freq(note), t + i * 0.06, 0.16, 0.19);
        });
        break;
      case 'select':
        this.blip('square', 700, 700, t, 0.05, 0.16);
        break;
    }
  }

  /** Start looping a tune. Passing the same tune again is a no-op. */
  playTune(tune: Tune): void {
    if (this.tune === tune) return;
    this.stopTune();
    this.tune = tune;
    if (!this.ctx) return;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    // Web Audio needs notes scheduled ahead of time; a timer this coarse would
    // sound ragged on its own, so it only queues notes the audio clock plays.
    this.timer = window.setInterval(() => this.schedule(), SCHEDULER_MS);
  }

  stopTune(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.tune = null;
  }

  private schedule(): void {
    const tune = this.tune;
    if (!this.ctx || !this.musicGain || !tune) return;

    const eighth = 60 / tune.bpm / 2;
    while (this.nextNoteTime < this.ctx.currentTime + LOOKAHEAD_SECONDS) {
      const lead = tune.lead[this.step % tune.lead.length];
      if (lead) this.tone(lead, this.nextNoteTime, eighth * 0.9, 'square', 0.16);

      // The bass moves at half the lead's rate.
      if (this.step % 2 === 0) {
        const index = (this.step / 2) % tune.bass.length;
        const bass = tune.bass[index];
        if (bass) this.tone(bass, this.nextNoteTime, eighth * 1.8, 'triangle', 0.3);
      }

      this.nextNoteTime += eighth;
      this.step++;
    }
  }

  /** A single sustained note routed through the music bus. */
  private tone(
    note: string,
    at: number,
    duration: number,
    type: OscillatorType,
    peak: number,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq(note);

    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
    gain.gain.setValueAtTime(peak, at + duration * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(gain).connect(this.musicGain);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  /** One oscillator with a pitch sweep and a percussive envelope. */
  private blip(
    type: OscillatorType,
    from: number,
    to: number,
    at: number,
    duration: number,
    peak: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + duration);

    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  /** A short burst of filtered noise, for impacts. */
  private noise(at: number, duration: number, peak: number): void {
    if (!this.ctx || !this.master) return;
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = peak;
    source.connect(gain).connect(this.master);
    source.start(at);
  }
}
