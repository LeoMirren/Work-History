// WORKSONG — WebAudio synthesis. No audio files; every sound is built from
// oscillators and filtered noise. Ambient music is a slow generative pad that
// pulls its scale from the current area's CONTENT entry.

const AudioSys = (() => {
  let ctx = null, master = null, musicGain = null, sfxGain = null, delayNode = null;
  let muted = false;
  let scale = [220, 262, 294, 330, 392, 440];
  let bossMode = false;
  let nextNoteAt = 0, noteStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.5;
      sfxGain.connect(master);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);

      // A feedback delay gives the pad a cavernous, Hallownest-ish wash.
      delayNode = ctx.createDelay(1.5);
      delayNode.delayTime.value = 0.42;
      const fb = ctx.createGain();
      fb.gain.value = 0.38;
      delayNode.connect(fb); fb.connect(delayNode);
      delayNode.connect(musicGain);

      nextNoteAt = ctx.currentTime + 0.5;
      return true;
    } catch (e) { return false; }
  }

  function env(gainNode, t0, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function tone(freq, type, peak, attack, decay, dest, bend) {
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(bend, 1), t0 + attack + decay);
    env(g, t0, peak, attack, decay);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t0); o.stop(t0 + attack + decay + 0.05);
  }

  function noise(peak, attack, decay, filterFreq, filterType) {
    const t0 = ctx.currentTime;
    const len = Math.ceil(ctx.sampleRate * (attack + decay + 0.05));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = filterType || 'bandpass'; f.frequency.value = filterFreq; f.Q.value = 0.8;
    const g = ctx.createGain();
    env(g, t0, peak, attack, decay);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t0); src.stop(t0 + attack + decay + 0.05);
  }

  const SFX = {
    jump()   { tone(240, 'square', 0.10, 0.01, 0.12, null, 420); },
    djump()  { tone(300, 'square', 0.10, 0.01, 0.14, null, 560); noise(0.05, 0.01, 0.1, 1200); },
    dash()   { noise(0.22, 0.01, 0.18, 900, 'highpass'); },
    slash()  { noise(0.16, 0.005, 0.09, 2600); tone(880, 'triangle', 0.05, 0.005, 0.06, null, 500); },
    hitEnemy(){ noise(0.2, 0.005, 0.08, 700); tone(180, 'square', 0.12, 0.005, 0.09, null, 90); },
    hitWall(){ tone(1200, 'triangle', 0.06, 0.004, 0.05, null, 900); },
    pogo()   { tone(500, 'square', 0.1, 0.01, 0.1, null, 760); },
    hurt()   { tone(140, 'sawtooth', 0.22, 0.01, 0.28, null, 55); noise(0.15, 0.01, 0.2, 400, 'lowpass'); },
    die()    { tone(220, 'sawtooth', 0.2, 0.02, 0.9, null, 40); noise(0.18, 0.02, 0.8, 300, 'lowpass'); },
    geo()    { tone(1320 + Math.floor(Math.random() * 3) * 160, 'triangle', 0.09, 0.004, 0.14); },
    soul()   { tone(660, 'sine', 0.05, 0.01, 0.2, null, 880); },
    focusChg(){ tone(330, 'sine', 0.05, 0.3, 0.5); },
    heal()   { tone(523, 'sine', 0.12, 0.02, 0.35); tone(784, 'sine', 0.1, 0.05, 0.4); },
    cast()   { tone(300, 'sawtooth', 0.14, 0.01, 0.25, null, 620); noise(0.1, 0.01, 0.2, 1600); },
    bench()  { [262, 330, 392, 523].forEach((f, i) => setTimeout(() => ctx && tone(f, 'sine', 0.1, 0.02, 0.8), i * 110)); },
    pickup() { [392, 494, 587, 784, 988].forEach((f, i) => setTimeout(() => ctx && tone(f, 'triangle', 0.1, 0.01, 0.5), i * 90)); },
    tablet() { tone(392, 'sine', 0.08, 0.05, 0.6); tone(587, 'sine', 0.05, 0.1, 0.7); },
    door()   { noise(0.2, 0.05, 0.6, 200, 'lowpass'); },
    roar()   { tone(70, 'sawtooth', 0.3, 0.05, 1.2, null, 45); noise(0.22, 0.05, 1.0, 250, 'lowpass'); },
    bossHit(){ noise(0.22, 0.005, 0.1, 900); tone(120, 'square', 0.15, 0.005, 0.12, null, 60); },
    bossDie(){ tone(90, 'sawtooth', 0.3, 0.1, 2.2, null, 30); noise(0.25, 0.1, 2.0, 500, 'lowpass'); },
    stag()   { tone(160, 'square', 0.18, 0.01, 0.3, null, 80); },
  };

  return {
    get muted() { return muted; },
    // Must be called from a user-gesture handler at least once.
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    sfx(name) { if (ctx && !muted && SFX[name]) SFX[name](); },
    setScale(s) { if (s && s.length) scale = s; },
    setBoss(on) { bossMode = on; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.8;
      return muted;
    },
    // Generative ambient: called every frame; schedules pad notes just ahead.
    update() {
      if (!ctx || muted) return;
      const interval = bossMode ? 0.55 : 2.2;
      while (nextNoteAt < ctx.currentTime + 0.3) {
        const t = nextNoteAt;
        noteStep++;
        const pick = bossMode
          ? scale[(noteStep * 2 + (noteStep % 3)) % scale.length] * (noteStep % 4 === 0 ? 0.5 : 1)
          : scale[(noteStep * 3) % scale.length] * ((noteStep % 5 === 0) ? 2 : (noteStep % 7 === 0 ? 0.5 : 1));
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = bossMode ? 'sawtooth' : 'sine';
        o.frequency.setValueAtTime(pick, t);
        const dur = bossMode ? 0.4 : 3.2;
        const peak = bossMode ? 0.5 : 0.9;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(delayNode);
        o.start(t); o.stop(t + dur + 0.1);
        // A faint fifth above, for width.
        if (!bossMode && noteStep % 2 === 0) {
          const o2 = ctx.createOscillator(), g2 = ctx.createGain();
          o2.type = 'triangle'; o2.frequency.setValueAtTime(pick * 1.5, t + 0.4);
          g2.gain.setValueAtTime(0.0001, t + 0.4);
          g2.gain.exponentialRampToValueAtTime(0.25, t + 1.4);
          g2.gain.exponentialRampToValueAtTime(0.0001, t + 3.0);
          o2.connect(g2); g2.connect(delayNode);
          o2.start(t + 0.4); o2.stop(t + 3.2);
        }
        nextNoteAt += interval;
      }
    },
  };
})();
