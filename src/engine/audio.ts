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
}
