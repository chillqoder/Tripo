import { CONFIG } from './config.js';
export const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function spellPose(elapsed) {
  const t = CONFIG.timeline;
  return smoothstep(0, t.prepare, elapsed) * (1 - smoothstep(t.fade, t.end, elapsed));
}

export function spellIntensity(elapsed) {
  return smoothstep(.48, .85, elapsed) * (1 - smoothstep(CONFIG.timeline.cast, CONFIG.timeline.fade, elapsed));
}

export class SpellState {
  constructor(onChange = () => {}) {
    this.spell = null;
    this.state = 'IDLE';
    this.startedAt = 0;
    this.elapsed = 0;
    this.onChange = onChange;
    this.completed = 0;
  }

  start(spell, now) {
    if (this.spell || !['lightning', 'fire', 'water'].includes(spell)) return false;
    this.spell = spell;
    this.startedAt = now;
    this.elapsed = 0;
    this.state = 'PREPARE';
    this.onChange(this);
    return true;
  }

  update(now) {
    if (!this.spell) return;
    this.elapsed = Math.max(0, now - this.startedAt);
    const t = CONFIG.timeline;
    let next = this.elapsed < t.prepare ? 'PREPARE'
      : this.elapsed < t.cast ? 'CAST'
      : this.elapsed < t.fade ? 'FADE'
      : this.elapsed < t.end ? 'RECOVER' : 'IDLE';
    if (next === 'IDLE') { this.spell = null; this.completed++; }
    if (next !== this.state) { this.state = next; this.onChange(this); }
  }
}
