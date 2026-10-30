import { clonePose, copyPose, lerpPose } from './pose.js';
import { evalIdle, idleEvents } from './idle.js';
import { smoothstep } from './curves.js';

/**
 * Animation state machine.
 *
 *   idle  : continuous procedural idle pose (breathing, sway, growls)
 *   action: one authored action at a time; the action pose is blended over the idle pose with a
 *           smooth in/out weight, so the character always starts from and returns to the same stance.
 *
 * A single Pose is built per frame and handed to the Solver, so exactly one system owns every bone each frame
 * (see Solver for the FK / IK ownership table).  Input while an action is running is ignored, so animations,
 * effects and sounds can never stack.
 */
export class AnimController {
  constructor({ solver, stance, ctx = {} }) {
    this.solver = solver;
    this.stance = stance;
    this.ctx = ctx;
    this.idlePose = clonePose(stance);
    this.actionPose = clonePose(stance);
    this.pose = clonePose(stance);
    this.t = 0;                  // idle clock (scaled time)
    this.timeScale = 1;
    this.active = null;
    this.ta = 0;
    this.actions = {};
    this.listeners = new Set();
    this.lastWeight = 0;
  }

  register(action) { this.actions[action.name] = action; return this; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(name, data = {}) { for (const fn of this.listeners) fn(name, data); }

  get busy() { return !!this.active; }
  get state() { return this.active ? 'action:' + this.active.name : 'idle'; }
  get progress() { return this.active ? this.ta / this.active.duration : 0; }

  play(name) {
    const a = this.actions[name];
    if (!a || this.active) return false;
    this.active = a;
    this.ta = 0;
    this._fired = 0;
    a.begin?.(this.ctx, this);
    this.emit('actionStart', { name });
    return true;
  }

  weight(a, ta) {
    if (a.weight) return a.weight(ta);
    const inT = a.blendIn ?? 0.35, outT = a.blendOut ?? 0.6;
    return smoothstep(0, inT, ta) * (1 - smoothstep(a.duration - outT, a.duration, ta));
  }

  /** Evaluate the final pose for an action time without advancing anything (preview / tests). */
  poseAt(name, ta, idleT = this.t, out = this.pose) {
    const a = this.actions[name];
    evalIdle(idleT, this.stance, this.idlePose);
    a.begin?.(this.ctx, this, true);
    a.eval(ta, this.actionPose, this.stance, this.ctx);
    return lerpPose(this.idlePose, this.actionPose, this.weight(a, ta), out);
  }

  update(dtReal) {
    const dt = dtReal * this.timeScale;
    const t0 = this.t;
    this.t += dt;
    evalIdle(this.t, this.stance, this.idlePose);
    if (this.active) {
      const a = this.active;
      const ta0 = this.ta;
      this.ta += dt;
      for (const ev of a.events || []) {
        if (ev.t > ta0 && ev.t <= this.ta) this.emit(ev.name, { ...ev, action: a.name, actionTime: this.ta });
      }
      a.eval(Math.min(this.ta, a.duration), this.actionPose, this.stance, this.ctx);
      this.lastWeight = this.weight(a, this.ta);
      lerpPose(this.idlePose, this.actionPose, this.lastWeight, this.pose);
      if (this.ta >= a.duration) {
        this.active = null;
        this.emit('actionEnd', { name: a.name });
        a.end?.(this.ctx, this);
      }
    } else {
      idleEvents(t0, this.t, (n, d) => this.emit(n, d));
      copyPose(this.idlePose, this.pose);
      this.lastWeight = 0;
    }
    this.solver.apply(this.pose);
  }
}
