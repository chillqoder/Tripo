// Simplified collision proxies (signed distance functions) for decorations.
// Each shape: { type, solid, ... } — `solid` shapes are hard constraints, soft ones (foliage)
// are avoided by steering and only lightly enforced.
import * as THREE from 'three';

export class Obstacles {
  constructor() { this.shapes = []; }

  addBox(name, cx, cy, cz, hx, hy, hz, rotY = 0, solid = true) {
    this.shapes.push({ type: 'box', name, c: [cx, cy, cz], h: [hx, hy, hz], cos: Math.cos(rotY), sin: Math.sin(rotY), solid });
  }
  addCylinder(name, cx, cz, r, y0, y1, solid = true) { this.shapes.push({ type: 'cyl', name, c: [cx, cz], r, y0, y1, solid }); }
  addEllipsoid(name, cx, cy, cz, rx, ry, rz, solid = true) { this.shapes.push({ type: 'ell', name, c: [cx, cy, cz], r: [rx, ry, rz], solid }); }
  addCapsule(name, a, b, r, solid = true) { this.shapes.push({ type: 'cap', name, a, b, r, solid }); }

  // distance to the nearest shape (negative inside); optionally only solid shapes
  distance(x, y, z, solidOnly = false) {
    let best = Infinity;
    for (const s of this.shapes) {
      if (solidOnly && !s.solid) continue;
      const d = sdf(s, x, y, z);
      if (d < best) best = d;
    }
    return best;
  }

  gradient(x, y, z, out = new THREE.Vector3(), solidOnly = false) {
    const e = 0.03;
    out.set(
      this.distance(x + e, y, z, solidOnly) - this.distance(x - e, y, z, solidOnly),
      this.distance(x, y + e, z, solidOnly) - this.distance(x, y - e, z, solidOnly),
      this.distance(x, y, z + e, solidOnly) - this.distance(x, y, z - e, solidOnly),
    );
    const l = out.length();
    return l > 1e-6 ? out.multiplyScalar(1 / l) : out.set(0, 1, 0);
  }
}

function sdf(s, x, y, z) {
  switch (s.type) {
    case 'box': {
      let px = x - s.c[0], pz = z - s.c[2];
      const lx = px * s.cos - pz * s.sin, lz = px * s.sin + pz * s.cos;
      const qx = Math.abs(lx) - s.h[0], qy = Math.abs(y - s.c[1]) - s.h[1], qz = Math.abs(lz) - s.h[2];
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0);
    }
    case 'cyl': {
      const dr = Math.hypot(x - s.c[0], z - s.c[1]) - s.r;
      const dy = Math.max(s.y0 - y, y - s.y1);
      return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0));
    }
    case 'ell': {
      // conservative ellipsoid approximation
      const px = (x - s.c[0]) / s.r[0], py = (y - s.c[1]) / s.r[1], pz = (z - s.c[2]) / s.r[2];
      const k = Math.hypot(px, py, pz);
      return (k - 1) * Math.min(s.r[0], s.r[1], s.r[2]);
    }
    case 'cap': {
      const ax = s.a[0], ay = s.a[1], az = s.a[2];
      const bx = s.b[0] - ax, by = s.b[1] - ay, bz = s.b[2] - az;
      const px = x - ax, py = y - ay, pz = z - az;
      const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz)));
      return Math.hypot(px - bx * t, py - by * t, pz - bz * t) - s.r;
    }
  }
  return Infinity;
}
