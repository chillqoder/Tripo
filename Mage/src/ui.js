import { CONFIG, SPELLS } from './config.js';

const icons = {
  lightning: '<path d="m14 3-9 11h6l-1 7 9-11h-6l1-7Z"/>',
  fire: '<path d="M12 3c1 5-4 6-4 10 0 1 .4 2 1 2.5-2.5-.5-4-2.5-3-5.5-4 5.5-1 11 6 11 4 0 7-2.8 7-6.5 0-4.5-4-6-4-8.5-.5 2-1 2.5-2 3C14 6 13 4 12 3Z"/><path class="icon-detail" d="M12 13c0 3-3 3-2 5 1 2 4 1 4-1 0-1.5-1-2.5-2-4Z"/>',
  water: '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/><path class="icon-detail" d="M8 15c0 2 1.5 3.5 3 3.5"/>',
};
const sigil = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 1v30M1 16h30M5.4 5.4l21.2 21.2M5.4 26.6 26.6 5.4" stroke="currentColor" stroke-width=".7"/><path d="m16 5 3.4 7.6L27 16l-7.6 3.4L16 27l-3.4-7.6L5 16l7.6-3.4L16 5Z" fill="currentColor"/><circle cx="16" cy="16" r="2.5" fill="#0a0c14"/></svg>';

export function createInterface(app) {
  app.innerHTML = `
    <main class="observatory">
      <div id="scene"></div>
      <div class="vignette" aria-hidden="true"></div>
      <header class="masthead">
        <div class="wordmark">${sigil}<span>MAGE</span><span class="brand-divider"></span><span class="brand-caption">THE ELEMENTAL<br>OBSERVATORY</span></div>
        <div class="edition"><span>AN INTERACTIVE SPELL STUDY</span><span class="edition-number">VOL. 001 <i>／</i> INFINITE POSSIBILITIES</span></div>
      </header>
      <section class="introduction" aria-label="Introduction">
        <p class="eyebrow"><span></span> A QUIET KIND OF EXTRAORDINARY</p>
        <h1>A little magic,<br><em>adrift.</em></h1>
        <p class="description">Somewhere between the stars,<br> a small wizard holds the elements.<br> The next move is yours.</p>
        <div class="intro-rule" aria-hidden="true"></div>
      </section>
      <div class="marginalia" aria-hidden="true"><span class="tiny-star">✧</span> FLOATING BETWEEN WORLDS <span class="margin-line"></span></div>
      <div class="coordinate" aria-hidden="true"><span class="coordinate-line"></span><span>NO MAP. NO DESTINATION.<br>JUST A LITTLE WONDER.</span></div>
      <section class="spell-dock" aria-label="Elemental spells">
        <div class="spell-caption" id="spell-caption">CHOOSE YOUR ELEMENT</div>
        <div class="spell-row">${Object.entries(SPELLS).map(([id, spell], i) => `
          <div class="spell-choice" style="--spell-color:${spell.color}">
            <button class="spell-button" data-spell="${id}" aria-label="Cast ${spell.name} (press ${i + 1})" aria-pressed="false" disabled>
              <svg class="cooldown" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="34" pathLength="100"/></svg>
              <svg class="spell-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[id]}</svg>
              <span class="key-hint">${i + 1}</span>
            </button>
            <span class="spell-name">${spell.name}</span>
          </div>`).join('')}</div>
        <p class="spell-status" id="spell-status" role="status" aria-live="polite">Gathering a little stardust…</p>
      </section>
      <footer><span><span class="footer-dot"></span> SOMEWHERE, BEYOND THE ORDINARY</span><span class="keyboard-hint">CLICK AN ELEMENT <i>·</i> OR PRESS 1, 2, 3</span></footer>
      <div id="loading" class="loading-overlay" role="status" aria-live="polite">
        <div class="loading-sigil">${sigil}</div><span id="loading-message">A LITTLE MAGIC IS ON ITS WAY</span>
        <div class="loading-track"><span id="loading-bar"></span></div>
      </div>
    </main>`;
  const buttons = [...app.querySelectorAll('.spell-button')];
  const status = app.querySelector('#spell-status');
  const caption = app.querySelector('#spell-caption');
  const loading = app.querySelector('#loading');
  let ready = false, cast = () => {};
  buttons.forEach(button => button.addEventListener('click', () => { if (ready && !button.disabled) cast(button.dataset.spell); }));
  window.addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.target?.matches('input, textarea, select, [contenteditable]')) return;
    const button = buttons[Number(event.key) - 1];
    if (button && !button.disabled) { event.preventDefault(); button.click(); }
  });
  return {
    progress(value) { app.querySelector('#loading-bar').style.width = `${Math.round(value * 100)}%`; },
    ready() {
      ready = true; buttons.forEach(button => { button.disabled = false; });
      loading.classList.add('loaded');
      status.textContent = 'A little curiosity goes a long way.';
    },
    error(message) {
      ready = false; loading.classList.remove('loaded'); loading.classList.add('has-error');
      app.querySelector('#loading-message').textContent = 'THE MAGIC COULD NOT ARRIVE';
      app.querySelector('.loading-track').hidden = true;
      const detail = document.createElement('p'); detail.className = 'error-detail';
      detail.textContent = `${message} Check that both files exist in public/assets, then reload.`;
      loading.append(detail); buttons.forEach(button => { button.disabled = true; });
    },
    onCast(callback) { cast = callback; },
    stateChanged(state) {
      const busy = !!state.spell;
      buttons.forEach(button => {
        button.disabled = busy;
        const active = button.dataset.spell === state.spell;
        button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
      });
      app.querySelector('.spell-dock').classList.toggle('is-casting', busy);
      caption.textContent = !busy ? 'CHOOSE YOUR ELEMENT'
        : state.state === 'PREPARE' ? 'GATHERING THE ELEMENTS'
        : state.state === 'RECOVER' ? 'RETURNING TO STILLNESS' : `${SPELLS[state.spell].name.toUpperCase()} IS IN YOUR HANDS`;
      status.textContent = busy ? SPELLS[state.spell].subtitle : 'A little curiosity goes a long way.';
      document.documentElement.style.setProperty('--active-color', busy ? SPELLS[state.spell].color : '#b8a8e7');
    },
    update(state) {
      if (state.spell) app.querySelector(`[data-spell="${state.spell}"]`).style.setProperty('--cooldown', Math.min(100, state.elapsed / CONFIG.timeline.end * 100));
    },
  };
}
