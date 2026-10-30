// Gentle spatial current: slow tank-wide circulation plus a localized rising plume above
// the aerator outlet that spreads along the surface. Used by bubbles, particles, plants
// and fins.
import { TANK } from '../config/scene.js';

export const plume = { x: 0, y: 0, z: 0, radius: 0.45, up: 0.55 };

export function currentAt(x, y, z, t, out) {
  // circulation: along +x near the surface, -x near the bottom, slow meander
  const yn = y / TANK.waterline;
  let vx = 0.05 * (yn - 0.45) + 0.012 * Math.sin(0.21 * t + z * 0.7);
  let vy = 0.006 * Math.sin(0.17 * t + x * 0.5);
  let vz = 0.016 * Math.sin(0.13 * t + x * 0.4 + 1.3);
  // plume: upward core above the outlet, widening with height, spreading near the top
  const dx = x - plume.x, dz = z - plume.z;
  const above = Math.max(0, y - plume.y);
  const rad = plume.radius + above * 0.12;
  const d2 = (dx * dx + dz * dz) / (rad * rad);
  if (y > plume.y - 0.3) {
    const core = Math.exp(-d2) * Math.min(1, (y - plume.y + 0.3) / 0.6);
    vy += plume.up * core;
    const spread = Math.exp(-d2 * 0.25) * Math.max(0, 1 - (TANK.waterline - y) / 1.2);
    const d = Math.sqrt(dx * dx + dz * dz) + 1e-3;
    vx += (dx / d) * 0.12 * spread; vz += (dz / d) * 0.12 * spread;
    // gentle entrainment toward the plume lower down
    const ent = Math.exp(-d2 * 0.15) * 0.04;
    vx -= (dx / d) * ent; vz -= (dz / d) * ent;
  }
  out.x = vx; out.y = vy; out.z = vz;
  return out;
}
