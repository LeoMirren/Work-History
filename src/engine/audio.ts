/**
 * Stretch §9: procedural WebAudio block-tap sounds. A pitched square blip
 * (per-block frequency) layered with a short noise tap — synthesized live,
 * zero audio assets. The AudioContext is created lazily inside the first
 * click gesture so autoplay policy never blocks it.
 */
import { hash2, mulberry32 } from '../world/noise';

export type TapKind = 'break' | 'place';

export class TapAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private failed = false;

  private ensure(): AudioContext | null {
    if (this.failed) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.25;
        this.master.connect(this.ctx.destination);
      } catch (err) {
        console.warn('WebAudio unavailable; block taps disabled', err);
        this.failed = true;
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  play(kind: TapKind, blockId: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;

    // Pitched blip: the block id picks a stable base note; placing rings higher.
    const base = 150 + (hash2(0x5eed, blockId, 1) % 130);
    const startFreq = base * (kind === 'place' ? 1.6 : 1);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, startFreq * 0.55), t + 0.07);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.35, t);
    oscGain.gain.exponentialRampToValueAtTime(0.002, t + 0.09);
    osc.connect(oscGain);
    oscGain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);

    // Short decaying noise tap for texture (deterministic per block+kind).
    const samples = Math.floor(ctx.sampleRate * 0.04);
    const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    const rng = mulberry32(blockId * 7919 + (kind === 'place' ? 1 : 0));
    for (let i = 0; i < samples; i++) {
      const fade = 1 - i / samples;
      channel[i] = (rng() * 2 - 1) * fade * fade;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.002, t + 0.05);
    noise.connect(noiseGain);
    noiseGain.connect(this.master);
    noise.start(t);
  }

  /**
   * Creature & combat voices — every call synthesizes a short gesture from
   * oscillators, so the world finally makes noise: growls, squeals, spits,
   * boss roars and slams, and idle birdsong. Zero assets, same lazy context.
   */
  voice(kind: VoiceKind): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    /** One swept-oscillator note into its own envelope. */
    const note = (
      type: OscillatorType,
      f0: number,
      f1: number,
      dur: number,
      gain: number,
      delay = 0,
    ): void => {
      if (!this.master) return;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t + delay);
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, f1), t + delay + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(gain, t + delay + Math.min(0.02, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.002, t + delay + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + delay);
      osc.stop(t + delay + dur + 0.02);
    };
    switch (kind) {
      case 'growl': // stalker menace: low sawtooth rumble, falling
        note('sawtooth', 110, 55, 0.28, 0.22);
        note('square', 70, 40, 0.3, 0.12, 0.03);
        break;
      case 'squeal': // prey hurt: quick high chirp bending down
        note('triangle', 620, 310, 0.12, 0.2);
        break;
      case 'pop': // death pop: a soft descending bloop
        note('sine', 340, 90, 0.16, 0.24);
        break;
      case 'spit': // venom bolt launch: airy rising zip
        note('sawtooth', 240, 760, 0.1, 0.14);
        break;
      case 'roar': // boss summon: long two-layer bellow
        note('sawtooth', 90, 45, 0.7, 0.3);
        note('square', 140, 60, 0.6, 0.18, 0.06);
        note('triangle', 55, 30, 0.8, 0.22, 0.1);
        break;
      case 'slam': // boss ground slam: deep thump + noise-free body
        note('sine', 120, 35, 0.22, 0.34);
        note('square', 60, 30, 0.18, 0.16, 0.01);
        break;
      case 'chirp': // idle birdsong: two quick up-notes
        note('sine', 1350, 1900, 0.06, 0.07);
        note('sine', 1600, 2200, 0.05, 0.06, 0.09);
        break;
    }
  }
}

export type VoiceKind = 'growl' | 'squeal' | 'pop' | 'spit' | 'roar' | 'slam' | 'chirp';
