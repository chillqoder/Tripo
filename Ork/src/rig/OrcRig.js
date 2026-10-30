import * as THREE from 'three';

const { Quaternion, Vector3 } = THREE;
const _q = new Quaternion();
const _q2 = new Quaternion();

/**
 * Thin wrapper around the skinned orc: bone lookup, captured rest pose and pose helpers.
 *
 * Pose conventions
 *  - World axes are the glTF/three axes: +Y up, +Z = the orc's front, the orc's RIGHT side is -X.
 *  - `setDelta(bone, dq)` rotates a bone by `dq`, expressed in model-aligned axes (as if the parent were still in
 *    its rest orientation), relative to the parent's *current* pose.  This makes the rotation axes independent
 *    of the arbitrary Blender bone rolls:  +X = bend forward, +Y = turn to the orc's left, +Z = lean to the orc's left.
 *  - `setWorldQuaternion(bone, wq)` sets an absolute orientation (used by IK).
 */
export class OrcRig {
  constructor(root) {
    this.root = root;
    this.bones = {};
    this.skinned = [];
    this.morphMeshes = [];
    root.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) {
        this.skinned.push(o);
        o.frustumCulled = false;
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.morphTargetDictionary) this.morphMeshes.push(o);
      }
    });
    root.updateMatrixWorld(true);
    this.rest = {};
    for (const name in this.bones) {
      const b = this.bones[name];
      this.rest[name] = {
        q: b.quaternion.clone(),
        p: b.position.clone(),
        wq: b.getWorldQuaternion(new Quaternion()),
        wp: b.getWorldPosition(new Vector3()),
        parent: b.parent && b.parent.isBone ? b.parent.name : null,
      };
    }
    const rootWQ = root.getWorldQuaternion(new Quaternion());
    for (const name in this.rest) {
      const r = this.rest[name];
      r.pwq = r.parent ? this.rest[r.parent].wq.clone() : rootWQ.clone();
      r.pwqInv = r.pwq.clone().invert();
      r.wqInv = r.wq.clone().invert();
    }
    const kids = {};
    for (const n in this.rest) { const p = this.rest[n].parent; if (p) (kids[p] ||= []).push(n); }
    this.kids = kids;
  }

  has(name) { return !!this.bones[name]; }

  /** restore every bone to the bind pose */
  reset() {
    for (const name in this.bones) {
      const b = this.bones[name];
      b.position.copy(this.rest[name].p);
      b.quaternion.copy(this.rest[name].q);
    }
    this.setMorph('Breath', 0);
  }

  setMorph(name, v) {
    for (const m of this.morphMeshes) {
      const i = m.morphTargetDictionary[name];
      if (i !== undefined) m.morphTargetInfluences[i] = v;
    }
  }

  /** model-axis delta rotation relative to the parent's current pose */
  setDelta(name, dq) {
    const r = this.rest[name];
    this.bones[name].quaternion.copy(r.pwqInv).multiply(dq).multiply(r.pwq).multiply(r.q);
  }

  /** delta built from model-axis euler angles (radians) */
  setDeltaEuler(name, x, y = 0, z = 0) {
    _q2.setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
    this.setDelta(name, _q2);
  }

  /** offset a bone's local position by a world-aligned vector (used for the pelvis) */
  offsetPosition(name, worldOffset) {
    const b = this.bones[name];
    b.parent.updateWorldMatrix(true, false);
    const parentWQInv = b.parent.getWorldQuaternion(_q).invert();
    b.position.copy(this.rest[name].p).add(worldOffset.clone().applyQuaternion(parentWQInv));
  }

  /** absolute world orientation for a bone; parents must already be posed */
  setWorldQuaternion(name, wq) {
    const b = this.bones[name];
    b.parent.updateWorldMatrix(true, false);
    b.parent.getWorldQuaternion(_q).invert();
    b.quaternion.copy(_q).multiply(wq);
    b.updateWorldMatrix(false, false);
  }

  /** absolute world orientation expressed as a delta from the rest world orientation: W = d * Wrest */
  setWorldDelta(name, d) {
    this.setWorldQuaternion(name, _q2.copy(d).multiply(this.rest[name].wq));
  }

  worldPos(name, out = new Vector3()) {
    this.bones[name].updateWorldMatrix(true, false);
    return this.bones[name].getWorldPosition(out);
  }

  worldQuat(name, out = new Quaternion()) {
    this.bones[name].updateWorldMatrix(true, false);
    return this.bones[name].getWorldQuaternion(out);
  }

  /** rest distance between two bone heads (metres) */
  restDistance(a, b) { return this.rest[a].wp.distanceTo(this.rest[b].wp); }

  updateWorld() { this.root.updateMatrixWorld(true); }
}
