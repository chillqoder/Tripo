import { CONFIG } from './config.js';
import { smoothstep } from './spell-state.js';

// Local sound design: no downloads, autoplay, or background ambience.
export function createSpellBuffer(context, spell) {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(2, Math.round(rate * CONFIG.timeline.fade), rate);
  let seed = { lightning: 817, fire: 269, water: 433 }[spell];
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  const events = [];
  for (let t = .58; t < CONFIG.timeline.cast; t += .08 + random() * .26) {
    events.push({ time: t, frequency: 440 + random() * 1500,
      decay: .025 + random() * .10, pan: random() * 1.4 - .7 });
  }
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  let low = 0, rumble = 0, previousNoise = 0, phase = 0, peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const t = i / rate;
    const noise = random() * 2 - 1;
    low += (noise - low) * (1 - Math.exp(-Math.PI * 2 * 900 / rate));
    rumble += (noise - rumble) * (1 - Math.exp(-Math.PI * 2 * 110 / rate));
    const high = noise - previousNoise;
    previousNoise = noise;
    const active = smoothstep(.48, .85, t) * (1 - smoothstep(CONFIG.timeline.cast, CONFIG.timeline.fade, t));
    const charge = Math.sin(Math.PI * Math.min(1, t / .85)) ** 2;
    const tail = 1 - smoothstep(CONFIG.timeline.cast, CONFIG.timeline.fade, t);
    phase += Math.PI * 2 * (220 + smoothstep(0, .7, t) * 220) / rate;
    const shimmer = (Math.sin(phase) + .4 * Math.sin(phase * 1.5) + .18 * Math.sin(phase * 3.003));
    let sound = shimmer * (.075 * charge + .014 * active) * tail;
    let stereo = 0;
    if (spell === 'lightning') {
      sound += active * (rumble * 1.6 + low * .18 + high * .025 * (1 + Math.sin(t * 131)));
    } else if (spell === 'fire') {
      const flutter = .75 + Math.sin(t * 17) * .14 + Math.sin(t * 31.7) * .10;
      sound += active * (low * .65 + rumble * 1.25) * flutter;
    } else {
      sound += active * (low * .32 + noise * .045) * (.85 + Math.sin(t * 7.3) * .15);
    }
    for (const event of events) {
      const age = t - event.time;
      if (age < 0 || age > event.decay * 7) continue;
      const envelope = (1 - Math.exp(-age * 1800)) * Math.exp(-age / event.decay) * active;
      let detail;
      if (spell === 'lightning') {
        detail = (high * .32 + Math.sin(age * event.frequency * 6.283) * .10) * envelope;
      } else if (spell === 'fire') {
        detail = high * .20 * envelope ** 3;
      } else {
        // A decaying, rising resonant bubble over the flowing water bed.
        detail = Math.sin(6.283 * event.frequency * (age + age * age * 2)) * .12 * envelope;
      }
      sound += detail;
      stereo += detail * event.pan;
    }
    left[i] = sound - stereo * .35;
    right[i] = sound + stereo * .35;
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const gain = .62 / Math.max(.62, peak);
  for (let i = 0; i < buffer.length; i++) { left[i] *= gain; right[i] *= gain; }
  return buffer;
}

export class SpellAudio {
  constructor() {
    this.context = null;
    this.buffers = new Map();
    this.voices = new Map();
    this.active = null;
    this.speechLevel = 0;
    this.lastUpdate = 0;
  }

  async loadVoices() {
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContext) return;
    const decoder = new OfflineContext(1, 1, 22050);
    await Promise.all(['lightning', 'fire', 'water'].map(async spell => {
      const response = await fetch(`${import.meta.env.BASE_URL}audio/${spell}-voice.mp3`);
      if (!response.ok) throw new Error(`Could not load the ${spell} invocation.`);
      const buffer = await decoder.decodeAudioData(await response.arrayBuffer());
      const data = buffer.getChannelData(0);
      const step = Math.round(buffer.sampleRate * .02);
      const envelope = new Float32Array(Math.ceil(data.length / step));
      let peak = 0;
      for (let i = 0; i < envelope.length; i++) {
        let sum = 0;
        const end = Math.min(data.length, (i + 1) * step);
        for (let j = i * step; j < end; j++) sum += data[j] ** 2;
        envelope[i] = Math.sqrt(sum / (end - i * step));
        peak = Math.max(peak, envelope[i]);
      }
      for (let i = 0; i < envelope.length; i++) {
        envelope[i] = Math.max(0, Math.min(1, (envelope[i] / Math.max(.01, peak) - .045) * 1.3));
      }
      this.voices.set(spell, { buffer, envelope });
    }));
  }

  play(spell) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.output = this.context.createDynamicsCompressor();
        this.output.threshold.value = -10;
        this.output.knee.value = 12;
        this.output.ratio.value = 3;
        const master = this.context.createGain();
        master.gain.value = .8;
        this.output.connect(master); master.connect(this.context.destination);
      }
      const context = this.context;
      // Resume inside the click/key gesture, including the first cast on mobile.
      const resumed = context.resume();
      this.stop();
      const cast = { spell, startedAt: performance.now() / 1000, source: null, voiceSource: null };
      this.active = cast;
      if (!this.buffers.has(spell)) this.buffers.set(spell, createSpellBuffer(context, spell));
      const begin = () => {
        if (this.active !== cast) return;
        const offset = performance.now() / 1000 - cast.startedAt;
        if (offset >= CONFIG.timeline.fade) { this.stop(); return; }
        const source = context.createBufferSource();
        source.buffer = this.buffers.get(spell);
        const magicGain = context.createGain();
        magicGain.connect(this.output); source.connect(magicGain);
        cast.magicGain = magicGain;
        cast.source = source;
        source.onended = () => {
          source.disconnect(); magicGain.disconnect();
          if (this.active === cast) this.active = null;
        };
        source.start(context.currentTime, offset);
        const voice = this.voices.get(spell);
        if (voice && offset < voice.buffer.duration + .08) {
          const voiceSource = context.createBufferSource();
          voiceSource.buffer = voice.buffer;
          voiceSource.connect(this.output);
          cast.voiceSource = voiceSource;
          voiceSource.onended = () => {
            voiceSource.disconnect(); cast.voiceSource = null;
            if (this.active === cast) this.speechLevel = 0;
          };
          voiceSource.start(context.currentTime + Math.max(0, .08 - offset), Math.max(0, offset - .08));
        }
      };
      if (context.state === 'running') begin();
      else resumed.then(begin).catch(() => this.stop());
    } catch {
      // An unavailable audio device must not interrupt a spell animation.
      this.stop();
    }
  }

  update(state) {
    if (this.active && (state.spell !== this.active.spell || state.elapsed >= CONFIG.timeline.fade)) this.stop();
    const now = performance.now() / 1000;
    const delta = Math.min(.1, Math.max(0, now - this.lastUpdate));
    this.lastUpdate = now;
    const cast = this.active;
    const voice = cast && this.voices.get(cast.spell);
    const index = cast ? Math.floor((now - cast.startedAt - .08) / .02) : -1;
    const target = cast?.voiceSource && this.context.state === 'running' ? (voice?.envelope[index] || 0) : 0;
    this.speechLevel += (target - this.speechLevel) * (1 - Math.exp(-delta / (target > this.speechLevel ? .025 : .055)));
    if (cast?.magicGain) cast.magicGain.gain.setTargetAtTime(target > .05 ? .55 : 1, this.context.currentTime, .06);
  }

  stop() {
    const cast = this.active;
    this.active = null;
    this.speechLevel = 0;
    for (const source of [cast?.source, cast?.voiceSource]) {
      if (source) { source.stop(); source.disconnect(); }
    }
    cast?.magicGain?.disconnect();
  }
}
