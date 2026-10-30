import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpellState, spellPose, spellIntensity } from '../src/spell-state.js';
import { CONFIG } from '../src/config.js';

test('a complete cast follows the five phases and rejects stacked input', () => {
  const phases = [];
  const state = new SpellState(s => phases.push(s.state));
  assert.equal(state.start('lightning', 100), true);
  assert.equal(state.start('fire', 100.1), false);
  for (const time of [.71, 3.81, 4.41, 4.99]) state.update(100 + time);
  assert.deepEqual(phases, ['PREPARE', 'CAST', 'FADE', 'RECOVER', 'IDLE']);
  assert.equal(state.spell, null);
  assert.equal(state.completed, 1);
  assert.equal(state.start('water', 106), true);
});

test('the staff stays fully raised until all effects have faded', () => {
  for (let t = .7; t <= 4.4; t += .01) assert.ok(Math.abs(spellPose(t) - 1) < .000001);
  assert.equal(spellIntensity(4.4), 0);
  assert.equal(spellIntensity(CONFIG.timeline.end), 0);
  assert.equal(spellPose(CONFIG.timeline.end), 0);
  assert.ok(CONFIG.timeline.end <= 5);
});

test('wall-clock catch-up cleans up a cast after an inactive tab resumes', () => {
  const state = new SpellState(); state.start('fire', 0); state.update(30);
  assert.equal(state.state, 'IDLE'); assert.equal(state.spell, null);
  assert.equal(state.start('unknown', 32), false);
  assert.equal(state.start('lightning', 32), true);
});

test('pose and effect envelopes have smooth endpoints', () => {
  const epsilon = .0001;
  assert.ok(spellPose(epsilon) < .000001);
  assert.ok(spellPose(CONFIG.timeline.end - epsilon) < .000001);
  assert.equal(spellIntensity(.48), 0);
  assert.equal(spellIntensity(.85), 1);
  assert.ok(spellIntensity(4.4 - epsilon) < .000001);
});
