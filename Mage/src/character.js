import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { spellPose } from './spell-state.js';

const v = new THREE.Vector3();

export async function loadCharacter(island, onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_, loaded, total) => onProgress(loaded / total);
  const loader = new GLTFLoader(manager);
  const [wizard, staffAsset] = await Promise.all([
    loader.loadAsync(`${import.meta.env.BASE_URL}assets/wizard-rigged.glb`),
    loader.loadAsync(`${import.meta.env.BASE_URL}assets/staff.glb`),
  ]);
  const actor = new THREE.Group(); actor.rotation.y = CONFIG.character.yaw;
  island.add(actor);
  const model = wizard.scene;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const sourceHeight = box.max.y - box.min.y;
  const scale = CONFIG.character.height / sourceHeight;
  model.scale.setScalar(scale); model.position.y = -box.min.y * scale + .006;
  actor.add(model);
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const bones = {};
  model.traverse(o => { if (o.isBone) bones[o.name] = o; });
  if (!bones.jaw || !bones.staffThumbTip || !bones.freeShoulder) throw new Error('The prepared wizard skin is missing. Run npm run prepare:assets.');
  bones.staffWrist.rotation.order = 'ZXY';

  const attachment = new THREE.Group(); attachment.name = 'Hand_attachment';
  attachment.position.fromArray(CONFIG.staff.handOffset);
  bones.staffWrist.add(attachment);
  // Both the shaft and the skin follow this same wrist. No world-space chasing.
  const staffPivot = new THREE.Group(); staffPivot.name = 'Adjustable_staff_grip'; attachment.add(staffPivot);
  // The shaft lies across the palm, along the row of fingers in source space.
  // Its local pose is fixed: the wrist carries the entire closed grip.
  staffPivot.rotation.set(Math.PI / 2, 0, CONFIG.staff.restTilt);
  const straightened = new THREE.Group(); straightened.rotation.z = CONFIG.staff.straightenZ;
  straightened.add(staffAsset.scene); straightened.updateMatrixWorld(true);
  const staffBox = new THREE.Box3().setFromObject(straightened);
  const measuredLength = staffBox.max.y - staffBox.min.y;
  const staffSceneScale = CONFIG.character.height * CONFIG.staff.heightRatio / measuredLength;
  // Parent is in wizard-source units. A single uniform scale preserves proportions.
  const relativeScale = staffSceneScale / scale;
  straightened.scale.setScalar(relativeScale);
  const grip = new THREE.Vector3().fromArray(CONFIG.staff.grip)
    .applyAxisAngle(new THREE.Vector3(0, 0, 1), CONFIG.staff.straightenZ).multiplyScalar(relativeScale);
  straightened.position.copy(grip).negate(); staffPivot.add(straightened);
  staffAsset.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const tip = new THREE.Object3D(); tip.name = 'Crystal_emission_point';
  tip.position.fromArray(CONFIG.staff.crystalTip); staffAsset.scene.add(tip);
  const crystalLight = new THREE.PointLight(0xa277ff, .65, 3.5, 2); actor.add(crystalLight);

  const bind = {};
  for (const [name, bone] of Object.entries(bones)) bind[name] = bone.rotation.clone();
  function update(time, state, speechLevel = 0) {
    const amount = state.spell ? spellPose(state.elapsed) : 0;
    const channel = time * 1.6;
    // Set from bind every frame: no accumulated transforms and no root bouncing.
    for (const [name, bone] of Object.entries(bones)) { bone.rotation.copy(bind[name]); bone.scale.set(1, 1, 1); }
    bones.spine.rotation.z = Math.sin(time * .72) * .009 + amount * Math.sin(channel) * .013;
    bones.chest.scale.y = 1 + Math.sin(time * 1.6) * .005;
    bones.chest.rotation.y = Math.sin(time * .51) * .018 + amount * .045;
    bones.head.rotation.y = Math.sin(time * .41) * .035 - amount * .08;
    bones.head.rotation.x = Math.sin(time * .67) * .012 - amount * .045;
    bones.jaw.rotation.x = THREE.MathUtils.clamp(speechLevel, 0, 1) * .045;
    // T-pose -> relaxed bent arms. Positive-X hand is the inspected gripping hand.
    bones.staffShoulder.rotation.z = THREE.MathUtils.lerp(-.78, .91, amount) + Math.sin(time * 1.2) * .012;
    bones.staffShoulder.rotation.y = -.11 + amount * .16;
    bones.staffElbow.rotation.z = .42 + amount * .10;
    bones.staffElbow.rotation.y = -.15;
    bones.staffWrist.rotation.y = -.08 + Math.sin(time * .9) * .012;
    bones.staffWrist.rotation.x = -Math.PI / 2;
    bones.staffWrist.rotation.z = -(bones.staffShoulder.rotation.z + bones.staffElbow.rotation.z) * .80;
    for (const [name, curl] of [['Little', .02], ['Middle', 0], ['Index', -.02]]) {
      bones[`staff${name}`].rotation.z = -.45 + curl;
      bones[`staff${name}Middle`].rotation.z = -.80;
      bones[`staff${name}Tip`].rotation.z = -.55;
    }
    bones.staffThumb.rotation.set(.85, -.05, 0, 'YXZ');
    bones.staffThumbTip.rotation.x = .30;
    bones.freeShoulder.rotation.z = .93 - amount * (.43 + Math.sin(channel) * .14);
    bones.freeShoulder.rotation.y = .08 + amount * Math.cos(channel) * .24;
    bones.freeShoulder.rotation.x = amount * Math.sin(channel) * .14;
    bones.freeElbow.rotation.z = -.18 - amount * (.36 + Math.cos(channel) * .13);
    bones.freeElbow.rotation.y = amount * -.32;
    bones.freeWrist.rotation.x = Math.sin(time * .7) * .04 + amount * Math.cos(channel) * .16;
    bones.freeWrist.rotation.y = amount * Math.sin(channel) * .20;
    model.updateMatrixWorld(true);
    staffPivot.updateMatrixWorld(true);
    tip.getWorldPosition(v); actor.worldToLocal(v); crystalLight.position.copy(v);
  }
  return {
    actor, model, bones, attachment, staffPivot, tip, crystalLight, update,
    measurements: { sourceHeight, wizardHeight: CONFIG.character.height, measuredStaffLength: measuredLength,
      staffHeight: measuredLength * staffSceneScale, staffHeightRatio: CONFIG.staff.heightRatio },
    getTip(target) { return tip.getWorldPosition(target); },
  };
}
