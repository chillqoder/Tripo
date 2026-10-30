import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpellBuffer } from '../src/audio.js';
import { CONFIG } from '../src/config.js';

const context = {
  sampleRate: 44100,
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, duration: length / sampleRate, getChannelData: i => data[i] };
  },
};
const buffers = Object.fromEntries(['lightning', 'fire', 'water'].map(spell => [spell, createSpellBuffer(context, spell)]));

for (const [spell, buffer] of Object.entries(buffers)) {
  test(`${spell} has finite stereo sound, headroom and a silent end before recovery`, () => {
    assert.equal(buffer.duration, CONFIG.timeline.fade);
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
    let energy = 0, stereo = 0;
    for (let i = 0; i < left.length; i++) {
      assert.ok(Number.isFinite(left[i]) && Number.isFinite(right[i]));
      assert.ok(Math.abs(left[i]) <= .621 && Math.abs(right[i]) <= .621);
      energy += left[i] ** 2;
      stereo += Math.abs(left[i] - right[i]);
    }
    assert.ok(Math.sqrt(energy / left.length) > .01, 'Sound must be audible');
    assert.ok(stereo > 1, 'Sound has stereo detail');
    assert.equal(left[0], 0);
    assert.ok(Math.abs(left.at(-1)) < .000001, 'No click at the end of the fade');
    assert.ok(buffer.duration < CONFIG.timeline.end);
  });
}

test('each element has a distinct sound', () => {
  assert.notDeepEqual(buffers.lightning.getChannelData(0), buffers.fire.getChannelData(0));
  assert.notDeepEqual(buffers.fire.getChannelData(0), buffers.water.getChannelData(0));
  assert.notDeepEqual(buffers.water.getChannelData(0), buffers.lightning.getChannelData(0));
});
