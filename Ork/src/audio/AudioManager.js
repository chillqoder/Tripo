/**
 * Local-only Web Audio mixer.  All files are fetched from public/assets/audio (no remote URLs).
 * The AudioContext is created immediately but stays suspended until the first user interaction
 * (browser autoplay policy); `unlock()` resumes it and starts the forest ambience.
 */
const FILES = {
  breathIn: ['breath_in_1', 'breath_in_2', 'breath_in_3'],
  breathOut: ['breath_out_1', 'breath_out_2', 'breath_out_3'],
  growl: ['growl_low_1', 'growl_low_2'],
  roarLong: ['roar_long_1', 'roar_long_2'],
  roarShort: ['roar_short_1', 'roar_short_2'],
  kiai: ['kiai_1', 'kiai_2'],
  grunt: ['grunt_1', 'grunt_2', 'grunt_3', 'grunt_4'],
  thump: ['thump_1', 'thump_2', 'thump_3'],
  whooshLift: ['whoosh_lift'],
  whooshSwing: ['whoosh_swing_1', 'whoosh_swing_2'],
  whooshLower: ['whoosh_lower'],
  impact: ['axe_impact_1', 'axe_impact_2'],
  extract: ['rock_extract'],
};
// master volume (0.9 -> 0.45: everything 50% quieter, relative balance unchanged)
const MASTER = 0.45;
// mix bus levels
const BUS = { voice: 0.95, body: 1.0, weapon: 0.9, breath: 0.85, ambience: 0.26 };   // ambience sits ~20 dB under the character sounds
const GROUP_BUS = {
  breathIn: 'breath', breathOut: 'breath', growl: 'voice', roarLong: 'voice', roarShort: 'voice', kiai: 'voice', grunt: 'voice',
  thump: 'body', whooshLift: 'weapon', whooshSwing: 'weapon', whooshLower: 'weapon', impact: 'weapon', extract: 'weapon',
};

export class AudioManager {
  constructor(baseUrl) {
    this.base = baseUrl;
    this.ctx = null;
    this.buffers = new Map();
    this.last = {};
    this.muted = false;
    this.unlocked = false;
    this.timeScale = 1;
    this.active = new Set();
    this.ready = false;
  }

  async init(onProgress) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { console.warn('Web Audio not supported'); return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.22;
    this.master.connect(comp).connect(this.ctx.destination);
    this.bus = {};
    for (const [k, v] of Object.entries(BUS)) { const g = this.ctx.createGain(); g.gain.value = v; g.connect(this.master); this.bus[k] = g; }

    const names = [...new Set(Object.values(FILES).flat())];
    let done = 0;
    await Promise.all(names.map(async (n) => {
      try {
        const res = await fetch(`${this.base}${n}.mp3`);
        if (!res.ok) throw new Error(res.status);
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(n, buf);
      } catch (e) { console.warn('audio file missing:', n, e); }
      onProgress?.(++done / (names.length + 1));
    }));
    try {
      const res = await fetch(`${this.base}ambience_forest.wav`);
      this.buffers.set('ambience_forest', await this.ctx.decodeAudioData(await res.arrayBuffer()));
    } catch (e) { console.warn('ambience missing', e); }
    onProgress?.(1);
    this.ready = true;
    if (this.unlocked) this.startAmbience();
  }

  /** call from the first user gesture */
  async unlock() {
    if (!this.ctx || this.unlocked) return;
    try { await this.ctx.resume(); } catch { /* ignore */ }
    this.unlocked = this.ctx.state === 'running';
    if (this.unlocked && this.ready) this.startAmbience();
  }

  startAmbience() {
    if (this.ambience || !this.buffers.has('ambience_forest')) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.get('ambience_forest');
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 3);
    src.connect(g).connect(this.bus.ambience);
    src.start();
    this.ambience = src;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.04);
  }

  setTimeScale(s) { this.timeScale = s; }

  pick(group) {
    const list = FILES[group].filter((n) => this.buffers.has(n));
    if (!list.length) return null;
    let n = list[Math.floor(Math.random() * list.length)];
    if (list.length > 1 && n === this.last[group]) n = list[(list.indexOf(n) + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length];
    this.last[group] = n;
    return n;
  }

  /**
   * Play one variation of a sound group.  opts: gain, rate, jitter (rate randomisation), pan, delay (s)
   * Returns the playing source (or null when audio is unavailable / locked / muted).
   */
  play(group, { gain = 1, rate = 1, jitter = 0.05, pan = 0, delay = 0 } = {}) {
    if (!this.ctx || !this.ready || !this.unlocked || this.muted) return null;
    const name = this.pick(group);
    if (!name) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.get(name);
    const slow = Math.pow(Math.max(this.timeScale, 0.05), 0.45);
    src.playbackRate.value = rate * slow * (1 + (Math.random() * 2 - 1) * jitter);
    const g = this.ctx.createGain();
    g.gain.value = gain * (0.93 + Math.random() * 0.14);
    let node = src.connect(g);
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(this.bus[GROUP_BUS[group]]);
    src.start(this.ctx.currentTime + delay);
    this.active.add(src);
    src.onended = () => this.active.delete(src);
    return src;
  }

  /** stop all one-shots (used if the scene is torn down) */
  stopAll() { for (const s of this.active) { try { s.stop(); } catch { /* already stopped */ } } this.active.clear(); }
}
