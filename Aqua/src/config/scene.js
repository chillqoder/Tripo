// Tank dimensions and composition. Interior is centred on x/z = 0 with the glass floor at y = 0.
export const TANK = {
  w: 13, d: 6.5, h: 7.2, // interior
  glass: 0.12,
  waterline: 6.6,
  rim: 0.12, // narrow upper rim height
  baseFrame: 0.32,
  pedestalH: 3.2,
};
TANK.hx = TANK.w / 2;
TANK.hz = TANK.d / 2;

export const LAYOUT = {
  castle: { x: 0.2, z: -1.95, rotY: 0, sink: 0.08 },
  aerator: { x: 5.25, z: -2.35, rotY: -0.35, sink: 0.06 },
  plants: {
    vallisneria: { x: 3.1, z: -2.35, rotY: 0.95 },
    cabomba: { x: -5.45, z: -0.7, rotY: Math.PI / 2 },
    javaFern: { x: -3.05, z: -2.25, rotY: 0.45 },
    anubias: { x: 4.55, z: 1.55, rotY: -0.5 },
  },
  rocks: [
    { x: -2.15, z: -0.75, rotY: 0.6 }, // tall dark rock beside the castle
    { x: -4.85, z: 2.2, rotY: 1.9 },
    { x: 5.6, z: -0.25, rotY: -0.4 },
  ],
  crabRoute: { z: 2.15, x: [-3.6, 3.3] },
  snailRoute: { z: 1.05, x: [-3.6, 2.9] },
  glassSnail: { x: -4.3, y: [1.25, 2.35] },
};
