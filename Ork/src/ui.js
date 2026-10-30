/** HUD: three action buttons (+ keys 1/2/3), slow motion (S), mute (M), status line. */
export function createUI({ ctrl, audio, onSlowmo }) {
  const $ = (id) => document.getElementById(id);
  const buttons = [...document.querySelectorAll('.act')];
  const status = $('status');
  const hint = $('audio-hint');
  const btnMute = $('btn-mute');
  const btnSlow = $('btn-slowmo');
  const KEYS = { Digit1: 'raise', Digit2: 'chest', Digit3: 'slam', Numpad1: 'raise', Numpad2: 'chest', Numpad3: 'slam' };
  let slow = false;

  const play = (name) => {
    audio.unlock();
    if (!ctrl.play(name)) { // busy: ignore, give a tiny visual nudge instead of stacking
      const b = buttons.find((x) => x.dataset.action === name);
      b?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 160 });
    }
  };
  buttons.forEach((b) => b.addEventListener('click', () => play(b.dataset.action)));

  const setMute = (m) => {
    audio.setMuted(m);
    btnMute.setAttribute('aria-pressed', String(m));
    btnMute.firstChild.textContent = m ? '🔇 Muted ' : '🔊 Sound ';
  };
  btnMute.addEventListener('click', () => { audio.unlock(); setMute(!audio.muted); });
  const setSlow = (s) => {
    slow = s;
    onSlowmo(s ? 0.25 : 1);
    btnSlow.setAttribute('aria-pressed', String(s));
  };
  btnSlow.addEventListener('click', () => setSlow(!slow));

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    audio.unlock();
    if (KEYS[e.code]) { play(KEYS[e.code]); e.preventDefault(); }
    else if (e.code === 'KeyM') setMute(!audio.muted);
    else if (e.code === 'KeyS') setSlow(!slow);
  });

  // enable audio on the first interaction (autoplay policy)
  const first = () => { audio.unlock().then(() => { if (audio.unlocked) hint.classList.add('hidden'); }); };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, first, { once: false, passive: true });
  const hintTimer = setInterval(() => { if (audio.unlocked) { hint.classList.add('hidden'); clearInterval(hintTimer); } }, 400);

  const labels = { raise: 'Raise Axe & Roar', chest: 'Beat Chest', slam: 'Ground Slam' };
  return {
    update() {
      const a = ctrl.active;
      status.textContent = a ? `${labels[a.name]} · ${Math.round(Math.min(1, ctrl.ta / a.duration) * 100)}%` : 'idle';
      for (const b of buttons) {
        b.classList.toggle('busy', !!a && a.name === b.dataset.action);
        b.classList.toggle('dim', !!a && a.name !== b.dataset.action);
        b.setAttribute('aria-disabled', String(!!a));
      }
    },
    setSlow,
  };
}
