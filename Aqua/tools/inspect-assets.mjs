// Stage 1 audit: dumps hierarchy, primitives, materials, textures, bounds, skins, morphs, animations.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('public/models');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(dir).filter(f => f.endsWith('.glb'));
for (const f of files) {
  const doc = await io.read(path.join(dir, f));
  const root = doc.getRoot();
  console.log(`\n=== ${f}`);
  console.log(' extensionsUsed:', root.listExtensionsUsed().map(e => e.extensionName).join(',') || '-');
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const walk = (n, d) => {
    const m = n.getMesh();
    console.log(`${'  '.repeat(d)}- node "${n.getName()}" t=${n.getTranslation().map(v=>v.toFixed(3))} r=${n.getRotation().map(v=>v.toFixed(3))} s=${n.getScale().map(v=>v.toFixed(3))}${m ? ` mesh="${m.getName()}" prims=${m.listPrimitives().length}` : ''}${n.getSkin() ? ' SKIN' : ''}${n.getCamera() ? ' CAMERA' : ''}${n.getExtension('KHR_lights_punctual') ? ' LIGHT' : ''}`);
    if (m) for (const p of m.listPrimitives()) {
      const pos = p.getAttribute('POSITION');
      const idx = p.getIndices();
      console.log(`${'  '.repeat(d+2)}prim mode=${p.getMode()} verts=${pos.getCount()} tris=${idx ? idx.getCount()/3 : pos.getCount()/3} attrs=${p.listSemantics().join(',')} mat="${p.getMaterial()?.getName()}" targets=${p.listTargets().length} min=${pos.getMin([]).map(v=>v.toFixed(3))} max=${pos.getMax([]).map(v=>v.toFixed(3))}`);
    }
    n.listChildren().forEach(c => walk(c, d + 1));
  };
  scene.listChildren().forEach(n => walk(n, 1));
  const b = getBounds(scene);
  console.log(' worldBounds min', b.min.map(v=>v.toFixed(3)), 'max', b.max.map(v=>v.toFixed(3)), 'size', b.max.map((v,i)=>(v-b.min[i]).toFixed(3)));
  for (const m of root.listMaterials()) console.log(` material "${m.getName()}" base=${m.getBaseColorFactor().map(v=>v.toFixed(2))} metal=${m.getMetallicFactor()} rough=${m.getRoughnessFactor()} alpha=${m.getAlphaMode()} dbl=${m.getDoubleSided()} baseTex=${!!m.getBaseColorTexture()} mrTex=${!!m.getMetallicRoughnessTexture()} nTex=${!!m.getNormalTexture()} eTex=${!!m.getEmissiveTexture()}`);
  for (const t of root.listTextures()) { const s = t.getSize(); console.log(` texture "${t.getName()}" ${t.getMimeType()} ${s ? s.join('x') : '?'}`); }
  console.log(' skins', root.listSkins().length, 'animations', root.listAnimations().map(a => a.getName()));
}
