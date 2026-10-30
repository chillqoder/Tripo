import './style.css';
import { createWorld } from './scene.js';
import { loadCharacter } from './character.js';
import { SpellState } from './spell-state.js';
import { SpellEffects } from './effects.js';
import { SpellAudio } from './audio.js';
import { createInterface } from './ui.js';

const ui = createInterface(document.querySelector('#app'));
let world;
try {
  world = createWorld(document.querySelector('#scene'));
  const character = await loadCharacter(world.island, ui.progress);
  const state = new SpellState(ui.stateChanged);
  const effects = new SpellEffects(world.scene, world.renderer);
  const audio = new SpellAudio();
  await audio.loadVoices();
  const start = performance.now() / 1000;
  ui.onCast(spell => {
    if (state.start(spell, performance.now() / 1000 - start)) audio.play(spell);
  });
  ui.ready();
  world.renderer.setAnimationLoop(() => {
    const time = performance.now() / 1000 - start;
    state.update(time);
    audio.update(state);
    world.update(time);
    character.update(time, state, audio.speechLevel);
    effects.update(state, character);
    ui.update(state);
    world.render();
  });
  // Development-only inspection; production behavior never depends on this.
  if (import.meta.env.DEV) {
    window.__mage = {
      world, character, state, effects, audio,
      snapshot() {
        const tip = character.tip.getWorldPosition(character.actor.position.clone());
        return { state: state.state, spell: state.spell, elapsed: state.elapsed,
          completed: state.completed, effects: effects.active, measurements: character.measurements,
          tip: tip.toArray(), memory: { ...world.renderer.info.memory } };
      },
    };
  }
} catch (error) {
  console.error('Mage could not start:', error);
  ui.error(error.message || 'A model could not be loaded.');
  world?.renderer.setAnimationLoop(null);
}
