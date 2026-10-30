// Single simulation clock (seconds). Pausing freezes simulated time; resuming or returning to
// a hidden tab never produces a large jump (frame delta is clamped and resynchronised).
export class SimClock {
  constructor() {
    this.time = 0;
    this.paused = false;
    this.last = performance.now();
    this.maxDt = 0.1;
  }
  resync() { this.last = performance.now(); }
  tick() {
    const now = performance.now();
    const real = Math.min((now - this.last) / 1000, 0.5);
    this.last = now;
    const dt = this.paused ? 0 : Math.min(real, this.maxDt);
    this.time += dt;
    return { dt, real };
  }
}
