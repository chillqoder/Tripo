import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  const data = readFileSync(new URL(path, import.meta.url));
  assert.equal(data.readUInt32LE(0), 0x46546c67);
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  const size = data.readUInt32LE(12);
  return { doc: JSON.parse(data.subarray(20, 20 + size).toString()), bin: data.subarray(size + 28) };
}
const original = read('../purple+wizard+3d+model.glb');
const prepared = read('../public/assets/wizard-rigged.glb');
const view = (asset, i) => {
  const v = asset.doc.bufferViews[i];
  return asset.bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
};

test('preparation preserves every source position, normal, UV, triangle and texture byte', () => {
  for (let i = 0; i < original.doc.bufferViews.length; i++) {
    assert.deepEqual(view(prepared, i), view(original, i));
  }
  assert.deepEqual(prepared.doc.materials, original.doc.materials);
  assert.deepEqual(prepared.doc.images, original.doc.images);
});

test('prepared skeleton has valid joint indices and normalized skin weights; feet stay rigid', () => {
  const attrs = prepared.doc.meshes[0].primitives[0].attributes;
  const joints = view(prepared, prepared.doc.accessors[attrs.JOINTS_0].bufferView);
  const weights = view(prepared, prepared.doc.accessors[attrs.WEIGHTS_0].bufferView);
  const positions = view(prepared, prepared.doc.accessors[attrs.POSITION].bufferView);
  const jointCount = prepared.doc.skins[0].joints.length;
  assert.equal(jointCount, 27);
  const count = prepared.doc.accessors[attrs.POSITION].count;
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let j = 0; j < 4; j++) {
      assert.ok(joints.readUInt16LE(i * 8 + j * 2) < jointCount);
      const weight = weights.readFloatLE(i * 16 + j * 4);
      assert.ok(weight >= 0 && weight <= 1); sum += weight;
    }
    assert.ok(Math.abs(sum - 1) < .00001);
    if (positions.readFloatLE(i * 12 + 4) < .15) {
      assert.equal(joints.readUInt16LE(i * 8), 0);
      assert.equal(weights.readFloatLE(i * 16), 1);
    }
  }
});

test('staff is an exact copy of the supplied asset', () => {
  assert.deepEqual(readFileSync(new URL('../magic+wand+3d+model.glb', import.meta.url)),
    readFileSync(new URL('../public/assets/staff.glb', import.meta.url)));
});
