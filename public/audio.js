const Audio = (() => {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let musicStop = null;
  const lastPlay = {};

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.72;
    master.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.2;
    musicGain.connect(master);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.58;
    sfxGain.connect(master);
  }

  async function ensure() {
    init();
    if (ctx.state === 'suspended') await ctx.resume();
  }

  function canPlay(id, gapMs) {
    const now = performance.now();
    if (lastPlay[id] && now - lastPlay[id] < gapMs) return false;
    lastPlay[id] = now;
    return true;
  }

  function tone(freq, dur, type, vol, dest, detune = 0) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest || sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, dest, filterHz = 900) {
    const t = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterHz;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest || sfxGain);
    src.start(t);
    src.stop(t + dur);
  }

  function playHit(intensity = 0.5) {
    if (!ctx || !canPlay('hit', 70)) return;
    const v = 0.25 + Math.min(1, intensity) * 0.45;
    tone(140 + intensity * 80, 0.12, 'square', v * 0.35);
    tone(70 + intensity * 40, 0.18, 'sawtooth', v * 0.5);
    noise(0.08, v * 0.35, sfxGain, 600 + intensity * 400);
  }

  function playShield(intensity = 0.6) {
    if (!ctx || !canPlay('shield', 90)) return;
    const v = 0.3 + Math.min(1, intensity) * 0.4;
    tone(520, 0.06, 'triangle', v * 0.4);
    tone(780, 0.1, 'sine', v * 0.35);
    noise(0.12, v * 0.45, sfxGain, 2200);
  }

  function playClash(intensity = 0.5) {
    if (!ctx || !canPlay('clash', 55)) return;
    const v = 0.2 + Math.min(1, intensity) * 0.5;
    tone(200 + intensity * 120, 0.07, 'square', v * 0.4);
    tone(310 + intensity * 90, 0.09, 'sawtooth', v * 0.3);
    noise(0.1, v * 0.55, sfxGain, 1400);
  }

  function playBump(intensity = 0.3) {
    if (!ctx || !canPlay('bump', 100)) return;
    const v = 0.15 + Math.min(1, intensity) * 0.35;
    tone(90, 0.14, 'sine', v * 0.55);
    noise(0.06, v * 0.3, sfxGain, 350);
  }

  function playPickup() {
    if (!ctx || !canPlay('pickup', 120)) return;
    tone(330, 0.08, 'sine', 0.22);
    tone(440, 0.1, 'triangle', 0.18);
    tone(550, 0.12, 'sine', 0.14);
  }

  function playThrow() {
    if (!ctx || !canPlay('throw', 100)) return;
    tone(180, 0.05, 'sawtooth', 0.2);
    noise(0.14, 0.25, sfxGain, 500);
    tone(120, 0.16, 'sine', 0.15);
  }

  function playUi() {
    if (!ctx || !canPlay('ui', 80)) return;
    tone(420, 0.06, 'sine', 0.15);
    tone(560, 0.08, 'sine', 0.12);
  }

  function playVictory() {
    if (!ctx) return;
    stopBattleMusic();
    tone(392, 0.15, 'triangle', 0.25);
    setTimeout(() => tone(523, 0.2, 'triangle', 0.28), 120);
    setTimeout(() => tone(659, 0.35, 'sine', 0.3), 260);
  }

  function playDefeat() {
    if (!ctx) return;
    stopBattleMusic();
    tone(196, 0.25, 'sawtooth', 0.22);
    setTimeout(() => tone(147, 0.35, 'triangle', 0.25), 180);
  }

  function startBattleMusic() {
    if (!ctx) return;
    stopBattleMusic();

    const t0 = ctx.currentTime;
    const drones = [];
    const freqs = [55, 82.5, 110];
    const types = ['sawtooth', 'triangle', 'sine'];

    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = types[i];
      osc.frequency.value = f;
      g.gain.value = i === 0 ? 0.14 : 0.07;
      osc.connect(g);
      g.connect(musicGain);
      osc.start(t0);
      drones.push(osc);
    });

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    musicGain.disconnect();
    musicGain.connect(filter);
    filter.connect(master);

    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.06;
    lfoG.gain.value = 120;
    lfo.connect(lfoG);
    lfoG.connect(filter.frequency);
    lfo.start(t0);

    let beat = 0;
    const beatTimer = setInterval(() => {
      if (!ctx || ctx.state === 'closed') return;
      beat++;
      const t = ctx.currentTime;
      const kick = ctx.createOscillator();
      const kickG = ctx.createGain();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(90, t);
      kick.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      kickG.gain.setValueAtTime(0.18, t);
      kickG.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      kick.connect(kickG);
      kickG.connect(musicGain);
      kick.start(t);
      kick.stop(t + 0.15);

      if (beat % 2 === 0) {
        noise(0.04, 0.06, musicGain, 800);
      }
      if (beat % 4 === 0) {
        tone(165, 0.2, 'triangle', 0.06, musicGain, -5);
      }
    }, 480);

    musicStop = () => {
      clearInterval(beatTimer);
      drones.forEach((o) => {
        try { o.stop(); } catch { /* noop */ }
      });
      try { lfo.stop(); } catch { /* noop */ }
      musicGain.disconnect();
      musicGain.connect(master);
    };
  }

  function stopBattleMusic() {
    if (musicStop) {
      musicStop();
      musicStop = null;
    }
  }

  return {
    ensure,
    startBattleMusic,
    stopBattleMusic,
    playHit,
    playShield,
    playClash,
    playBump,
    playPickup,
    playThrow,
    playUi,
    playVictory,
    playDefeat,
  };
})();

window.Audio = Audio;
