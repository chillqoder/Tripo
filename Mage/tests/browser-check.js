// Run against a dev server with playwright-cli run-code --filename=tests/browser-check.js.
async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(() => window.__mage && document.querySelector('#loading').classList.contains('loaded'));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  check(await page.locator('button').count() === 3, 'Exactly three spell buttons');
  const gripStability = await page.evaluate(() => {
    const { character, state } = window.__mage;
    let mesh;
    character.model.traverse(object => { if (object.isSkinnedMesh) mesh = object; });
    const position = mesh.geometry.attributes.position;
    const samples = [];
    for (let i = 0; i < position.count; i++) {
      if (position.getX(i) > .435 || (position.getX(i) > .413 && position.getZ(i) > .05)) samples.push(i);
    }
    const wrist = character.bones.staffWrist;
    const vector = character.actor.position.clone();
    const capture = () => samples.map(i => {
      mesh.getVertexPosition(i, vector);
      mesh.localToWorld(vector);
      return wrist.worldToLocal(vector).clone();
    });
    character.update(0, { spell: null, elapsed: 0 });
    const rest = capture();
    const staff = wrist.matrixWorld.clone().invert().multiply(character.staffPivot.matrixWorld);
    let maxFingerDrift = 0, maxStaffDrift = 0;
    for (let t = 0; t <= 5; t += .035) {
      character.update(t, { spell: 'fire', elapsed: t });
      const posed = capture();
      for (let i = 0; i < posed.length; i++) maxFingerDrift = Math.max(maxFingerDrift, rest[i].distanceTo(posed[i]));
      const relative = wrist.matrixWorld.clone().invert().multiply(character.staffPivot.matrixWorld);
      for (let i = 0; i < 16; i++) maxStaffDrift = Math.max(maxStaffDrift, Math.abs(staff.elements[i] - relative.elements[i]));
    }
    character.update(0, state);
    return { sampledVertices: samples.length, maxFingerDrift, maxStaffDrift };
  });
  check(gripStability.sampledVertices > 100, 'Check the actual finger and thumb skin');
  check(gripStability.maxFingerDrift < .000001, 'Finger and thumb skin retain the closed grip through the full animation');
  check(gripStability.maxStaffDrift < .000001, 'Staff orientation stays fixed inside the palm');
  const speechSkin = await page.evaluate(() => {
    const { character, state, audio } = window.__mage;
    let mesh;
    character.model.traverse(object => { if (object.isSkinnedMesh) mesh = object; });
    const positions = mesh.geometry.attributes.position;
    const mouth = [], eyes = [];
    for (let i = 0; i < positions.count; i++) {
      if (Math.abs(positions.getX(i)) < .02 && positions.getZ(i) > .09) {
        if (positions.getY(i) > .702 && positions.getY(i) < .715) mouth.push(i);
        if (positions.getY(i) > .735 && positions.getY(i) < .75) eyes.push(i);
      }
    }
    const vector = character.actor.position.clone();
    const capture = indices => indices.map(i => mesh.getVertexPosition(i, vector).clone());
    character.update(0, state, 0);
    const closedMouth = capture(mouth), restEyes = capture(eyes);
    character.update(0, state, 1);
    const openMouth = capture(mouth), speakingEyes = capture(eyes);
    const movement = (a, b) => Math.max(0, ...a.map((v, i) => v.distanceTo(b[i])));
    character.update(0, state, 0);
    return { mouthVertices: mouth.length, mouthMovement: movement(closedMouth, openMouth),
      eyeMovement: movement(restEyes, speakingEyes), voices: audio.voices.size,
      voiceDurations: [...audio.voices.values()].map(v => v.buffer.duration) };
  });
  check(speechSkin.mouthVertices > 10 && speechSkin.mouthMovement > .0001 && speechSkin.mouthMovement < .005, 'Speaking subtly moves the actual lower lip');
  check(speechSkin.eyeMovement < .000001, 'Speech leaves eyes and eyebrows in place');
  check(speechSkin.voices === 3 && speechSkin.voiceDurations.every(d => d > .5 && d < 4.4), 'Three spoken invocations are loaded and finish before recovery');
  const rounds = [];
  for (let round = 0; round < 2; round++) {
    for (const [i, spell] of ['lightning', 'fire', 'water'].entries()) {
      await page.keyboard.press(String(i + 1));
      await page.waitForFunction(() => window.__mage.state.state === 'CAST');
      check(await page.locator('button:disabled').count() === 3, 'All buttons disabled while casting');
      const active = await page.evaluate(() => {
        const { character, state, audio } = window.__mage;
        const grip = character.attachment.getWorldPosition(character.actor.position.clone());
        const pivot = character.staffPivot.getWorldPosition(character.actor.position.clone());
        const overlaps = state.start('water', state.startedAt + state.elapsed);
        return { spell: state.spell, overlaps, gripError: grip.distanceTo(pivot),
          audioRunning: audio.context?.state === 'running' && audio.active?.spell === state.spell
            && audio.active?.source?.buffer === audio.buffers.get(state.spell),
          armAngles: [character.bones.staffShoulder.rotation.z, character.bones.freeShoulder.rotation.z] };
      });
      check(active.spell === spell && !active.overlaps, 'Concurrent casts must be rejected');
      check(active.gripError < .000001, 'Staff stays exactly at the hand attachment');
      check(active.audioRunning, 'The matching spell sound plays after user input');
      await page.waitForFunction(() => window.__mage.audio.speechLevel > .1, null, { timeout: 2500 });
      check(await page.evaluate(() => window.__mage.character.bones.jaw.rotation.x > .001
        && !!window.__mage.audio.active?.voiceSource), 'Mouth movement accompanies the spoken invocation');
      check(active.armAngles[0] > .8 && active.armAngles[1] < .8, 'Both arms participate in casting');
      if (round === 0) {
        await page.waitForTimeout(800);
        await page.screenshot({ path: `output/playwright/${spell}.png` });
      }
      await page.waitForFunction(() => window.__mage.state.state === 'RECOVER');
      check(await page.evaluate(() => window.__mage.effects.active === null), 'No effects remain in recovery');
      check(await page.evaluate(() => window.__mage.audio.active === null), 'No sound remains in recovery');
      check(await page.evaluate(() => window.__mage.character.bones.jaw.rotation.x === 0), 'The mouth rests after speech');
      await page.waitForFunction(() => window.__mage.state.state === 'IDLE');
      check(await page.locator('button:enabled').count() === 3, 'Controls unlock after recovery');
    }
    rounds.push(await page.evaluate(() => window.__mage.snapshot()));
  }
  check(JSON.stringify(rounds[0].memory) === JSON.stringify(rounds[1].memory), 'GPU resources must stay constant across repeat casts');
  await page.screenshot({ path: 'output/playwright/desktop.png' });
  for (const [width, height] of [[390, 844], [320, 650], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(200);
    const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.body.scrollWidth,
      buttons: [...document.querySelectorAll('button')].map(b => ({ x: b.getBoundingClientRect().x, right: b.getBoundingClientRect().right, bottom:b.getBoundingClientRect().bottom })) }));
    check(layout.scroll <= layout.width, 'No horizontal overflow');
    check(layout.buttons.every(b => b.x >= 0 && b.right <= width && b.bottom <= height), 'All buttons fit');
    await page.screenshot({ path: `output/playwright/viewport-${width}x${height}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  const cameraView = () => page.evaluate(() => {
    const { camera, controls } = window.__mage.world;
    return { angle: controls.getAzimuthalAngle(), distance: camera.position.distanceTo(controls.target),
      direction: camera.position.clone().sub(controls.target).normalize().toArray() };
  });
  const initialView = await cameraView();
  await page.mouse.move(1050, 420);
  await page.mouse.down();
  await page.mouse.move(830, 460, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const rotatedView = await cameraView();
  check(Math.abs(rotatedView.angle - initialView.angle) > .1, 'Dragging rotates the camera');
  await page.mouse.wheel(0, -450);
  await page.waitForTimeout(700);
  const zoomedView = await cameraView();
  check(zoomedView.distance < rotatedView.distance * .9, 'Mouse wheel zooms in');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  const resizedView = await cameraView();
  check(resizedView.direction.every((v, i) => Math.abs(v - zoomedView.direction[i]) < .001), 'Resizing preserves the chosen viewing angle');
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 410 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 250, y: 430 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
  const touchRotatedView = await cameraView();
  check(Math.abs(touchRotatedView.angle - resizedView.angle) > .1, 'One finger rotates the camera');
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 145, y: 410 }, { x: 245, y: 410 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 95, y: 410 }, { x: 295, y: 410 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
  const pinchedView = await cameraView();
  check(pinchedView.distance < touchRotatedView.distance * .9, 'Two-finger pinch zooms in');
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await touch.detach();
  check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  return { passed: true, completedCasts: rounds[1].completed, resourcesAfterWarmup: rounds[0].memory,
    resourcesAfterRepeats: rounds[1].memory, gripStability, speechSkin,
    cameraControls: { mouseRotate: true, wheelZoom: true, touchRotate: true, pinchZoom: true, resizePreservesAngle: true },
    testedViewports: ['1440x900', '390x844', '320x650', '320x568', '844x390'], errors };
}
