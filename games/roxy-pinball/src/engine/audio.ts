/**
 * All sound is synthesised at runtime - there are no audio files to download,
 * license or wait for, which keeps the whole game a couple of hundred KB.
 *
 * Browsers refuse to start an AudioContext without a user gesture, so nothing
 * here works until `unlock()` is called from a tap or key press. Every method
 * is safe to call before that; they simply do nothing.
 */

export type Sfx =
  | 'flipper'
  | 'bumper'
  | 'sling'
  | 'target'
  | 'drop'
  | 'dropBank'
  | 'lane'
  | 'laneSet'
  | 'spinner'
  | 'saucer'
  | 'launch'
  | 'drain'
  | 'missionStart'
  | 'missionShot'
  | 'missionDone'
  | 'jackpot'
  | 'extraBall'
  | 'tilt'
  | 'bark'
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
      const Ctor =
        window.AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.22;
      this.musicGain.connect(this.master);
    } catch {
      // No audio available. The table is entirely playable without it.
      this.ctx = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * `strength` is 0..1 and comes from how hard the ball arrived, so a rattle
   * off a bumper and a full-speed slam are not the same noise.
   */
  play(sfx: Sfx, strength = 1): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const force = Math.max(0.25, Math.min(1, strength));

    switch (sfx) {
      case 'flipper':
        this.noise(t, 0.05, 0.1 * force, 1400);
        this.blip('square', 180, 90, t, 0.07, 0.1 * force);
        break;
      case 'bumper':
        this.blip('square', 620, 220, t, 0.11, 0.2 * force);
        this.noise(t, 0.06, 0.12 * force, 2200);
        break;
      case 'sling':
        this.blip('sawtooth', 420, 180, t, 0.08, 0.16 * force);
        break;
      case 'target':
        this.blip('square', 900, 900, t, 0.05, 0.16);
        this.blip('square', 1350, 1350, t + 0.04, 0.06, 0.12);
        break;
      case 'drop':
        this.blip('triangle', 1200, 500, t, 0.09, 0.18);
        break;
      case 'dropBank':
        ['C5', 'E5', 'G5'].forEach((note, i) => {
          this.blip('square', freq(note), freq(note), t + i * 0.07, 0.12, 0.18);
        });
        break;
      case 'lane':
        this.blip('sine', 1100, 1650, t, 0.07, 0.18);
        break;
      case 'laneSet':
        ['G4', 'B4', 'D5', 'G5'].forEach((note, i) => {
          this.blip('triangle', freq(note), freq(note), t + i * 0.08, 0.16, 0.18);
        });
        break;
      case 'spinner':
        this.blip('sawtooth', 1500, 900, t, 0.05, 0.09);
        break;
      case 'saucer':
        this.blip('sine', 300, 900, t, 0.2, 0.2);
        break;
      case 'launch':
        this.blip('sawtooth', 120, 700, t, 0.24, 0.2);
        break;
      case 'drain':
        this.blip('square', 380, 70, t, 0.5, 0.22);
        break;
      case 'missionStart':
        ['C4', 'G4', 'C5', 'E5', 'G5'].forEach((note, i) => {
          this.blip('square', freq(note), freq(note), t + i * 0.09, 0.16, 0.18);
        });
        break;
      case 'missionShot':
        this.blip('square', 700, 1400, t, 0.1, 0.2);
        break;
      case 'missionDone':
        ['C5', 'E5', 'G5', 'C6', 'G5', 'C6'].forEach((note, i) => {
          this.blip('triangle', freq(note), freq(note), t + i * 0.1, 0.18, 0.2);
        });
        break;
      case 'jackpot':
        ['G5', 'C6', 'E6'].forEach((note, i) => {
          this.blip('square', freq(note), freq(note), t + i * 0.06, 0.22, 0.22);
        });
        this.noise(t, 0.3, 0.1, 5000);
        break;
      case 'extraBall':
        ['G4', 'C5', 'E5', 'G5', 'E5', 'G5'].forEach((note, i) => {
          this.blip('triangle', freq(note), freq(note), t + i * 0.09, 0.14, 0.18);
        });
        break;
      case 'tilt':
        this.blip('sawtooth', 200, 60, t, 0.6, 0.25);
        break;
      case 'bark':
        // Two short falling bursts. Not a real dog, but unmistakably a bark.
        this.blip('sawtooth', 520, 260, t, 0.09, 0.2);
        this.blip('sawtooth', 460, 210, t + 0.13, 0.11, 0.18);
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
      if (lead) this.tone(lead, this.nextNoteTime, eighth * 0.9, 'square', 0.14);

      // The bass moves at half the lead's rate.
      if (this.step % 2 === 0) {
        const index = (this.step / 2) % tune.bass.length;
        const bass = tune.bass[index];
        if (bass) this.tone(bass, this.nextNoteTime, eighth * 1.8, 'triangle', 0.28);
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
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  /** A short burst of filtered noise, for impacts. */
  private noise(at: number, duration: number, peak: number, cutoff = 3000): void {
    if (!this.ctx || !this.master) return;
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.value = peak;
    source.connect(filter).connect(gain).connect(this.master);
    source.start(at);
  }
}

/** The attract-mode loop: a lazy backyard shuffle, not a march. */
export const ATTRACT_TUNE: Tune = {
  bpm: 104,
  lead: [
    'G4', null, 'B4', null, 'D5', null, 'B4', null,
    'C5', null, 'E5', null, 'D5', null, null, null,
    'G4', null, 'B4', null, 'D5', 'E5', 'D5', null,
    'A4', null, 'C5', null, 'B4', null, null, null,
  ],
  bass: ['G2', 'G2', 'C3', 'C3', 'G2', 'G2', 'D3', 'D3'],
};

/** In play: the same key, faster and busier, so the table feels alive. */
export const PLAY_TUNE: Tune = {
  bpm: 138,
  lead: [
    'G4', 'B4', 'D5', 'B4', 'G4', 'B4', 'D5', 'G5',
    'F5', 'D5', 'B4', 'D5', 'C5', 'E5', 'G5', 'E5',
    'G4', 'B4', 'D5', 'B4', 'A4', 'C5', 'E5', 'C5',
    'B4', 'D5', 'G5', 'D5', 'G5', 'F5', 'D5', null,
  ],
  bass: ['G2', 'D3', 'C3', 'G2', 'G2', 'D3', 'A2', 'D3'],
};
