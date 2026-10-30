// All model-space alignment values live here. Source GLBs use +Y up, +Z front.
export const CONFIG = {
  character: { height: 3, yaw: -.10 },
  staff: {
    heightRatio: 1.065,
    // Rotate the source's tilted shaft into +Y before measuring its full length.
    straightenZ: -.532,
    grip: [.0305, .449, -.033], // center of the original shaft, before straightening
    handOffset: [.026, -.027, -.012], // local to staffWrist, in ORIGINAL wizard units
    crystalTip: [-.226, .963, .061],
    restTilt: -.09,
  },
  camera: { fov: 35, targetY: 1.1, desktopDistance: 17.6 },
  render: { maxPixelRatio: 1.6, shadows: 2048, bloom: .36 },
  timeline: { prepare: .7, cast: 3.8, fade: 4.4, end: 4.98 },
};

export const SPELLS = {
  lightning: { name: 'Lightning', color: '#a5a2ff', hex: 0x868dff, subtitle: 'A spark becomes a storm.' },
  fire: { name: 'Fire', color: '#ffac79', hex: 0xff732e, subtitle: 'A little warmth from the stars.' },
  water: { name: 'Water', color: '#83dbe9', hex: 0x49d8ff, subtitle: 'Let the heavens fall softly.' },
};
