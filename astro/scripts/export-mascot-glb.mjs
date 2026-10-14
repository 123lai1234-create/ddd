#!/usr/bin/env node
/**
 * export-mascot-glb.mjs — build the chibi character in Node.js and export to GLB.
 *
 * Why: the previous mascot-3d.glb was a multi-view reconstruction (mc320) that
 *      came out as a rough stone. This script builds a clean stylized chibi
 *      from Three.js primitives (sphere head, capsule limbs) and writes a
 *      proper GLB to public/models/mascot-3d.glb.
 *
 * Run from astro/:
 *   node scripts/export-mascot-glb.mjs
 *
 * Output: public/models/mascot-3d.glb  (~10-30 KB, well under the 6.3MB stone)
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Polyfill FileReader for Node.js (GLTFExporter uses it internally)
class FileReaderPolyfill {
  constructor() {
    this.result = null;
    this.onloadend = null;
  }
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
    }).catch((e) => {
      if (this.onerror) this.onerror(e);
    });
  }
  readAsDataURL(blob) {
    blob.text().then((text) => {
      this.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' +
        Buffer.from(text, 'binary').toString('base64');
      if (this.onloadend) this.onloadend();
    });
  }
}
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = FileReaderPolyfill;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '..', 'public', 'models', 'mascot-3d.glb');

const COLORS = {
  skin:    0xfdd2ae,
  hair:    0x2a1a14,
  shirt:   0x6090c0,
  pants:   0x303040,
  eye:     0x0c0a0a,
  eyeWhite:0xffffff,
  cheek:   0xff9aa2,
  shoe:    0x4a3a2a,
};

function makeChibi() {
  const g = new THREE.Group();
  g.name = 'ChibiMascot';

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 32, 28),
    new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.55, metalness: 0, name: 'skin' })
  );
  head.scale.set(1.0, 0.95, 1.0);
  head.position.y = 0.75;
  head.name = 'Head';
  g.add(head);

  // Hair top
  const hairMat = new THREE.MeshStandardMaterial({ color: COLORS.hair, roughness: 0.85, metalness: 0, name: 'hair' });
  const hairTop = new THREE.Mesh(
    new THREE.SphereGeometry(0.57, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    hairMat
  );
  hairTop.position.y = 0.75;
  hairTop.name = 'HairTop';
  g.add(hairTop);

  // Hair back
  const hairBack = new THREE.Mesh(
    new THREE.SphereGeometry(0.58, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    hairMat
  );
  hairBack.position.y = 0.55;
  hairBack.scale.set(1.02, 0.7, 1.02);
  hairBack.name = 'HairBack';
  g.add(hairBack);

  // Bangs
  const bangs = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    hairMat
  );
  bangs.position.set(0, 0.7, 0.32);
  bangs.scale.set(1.2, 0.7, 0.7);
  bangs.name = 'Bangs';
  g.add(bangs);

  // Eyes
  function makeEye(x) {
    const eye = new THREE.Group();
    eye.name = x < 0 ? 'LeftEye' : 'RightEye';
    const w = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 18, 18),
      new THREE.MeshStandardMaterial({ color: COLORS.eyeWhite, roughness: 0.3, name: 'eyeWhite' })
    );
    w.name = 'White';
    eye.add(w);
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 12, 12),
      new THREE.MeshStandardMaterial({ color: COLORS.eye, roughness: 0.2, name: 'eye' })
    );
    p.position.z = 0.045;
    p.name = 'Pupil';
    eye.add(p);
    eye.position.set(x, 0.78, 0.5);
    return eye;
  }
  g.add(makeEye(-0.16));
  g.add(makeEye(0.16));

  // Cheeks
  const cheekMat = new THREE.MeshStandardMaterial({
    color: COLORS.cheek, roughness: 0.9, transparent: true, opacity: 0.55, name: 'cheek'
  });
  const lCheek = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), cheekMat);
  lCheek.position.set(-0.32, 0.66, 0.46);
  lCheek.scale.set(1, 0.6, 0.3);
  lCheek.name = 'LeftCheek';
  g.add(lCheek);
  const rCheek = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), cheekMat);
  rCheek.position.set(0.32, 0.66, 0.46);
  rCheek.scale.set(1, 0.6, 0.3);
  rCheek.name = 'RightCheek';
  g.add(rCheek);

  // Body
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.32, 0.6, 24),
    new THREE.MeshStandardMaterial({ color: COLORS.shirt, roughness: 0.7, name: 'shirt' })
  );
  body.position.y = 0.2;
  body.name = 'Body';
  g.add(body);

  // Arms
  const armGeo = new THREE.CapsuleGeometry(0.08, 0.3, 8, 16);
  const armMat = new THREE.MeshStandardMaterial({ color: COLORS.shirt, roughness: 0.7, name: 'shirt' });
  const lArm = new THREE.Mesh(armGeo, armMat);
  lArm.position.set(-0.34, 0.15, 0);
  lArm.rotation.z = 0.18;
  lArm.name = 'LeftArm';
  g.add(lArm);
  const rArm = new THREE.Mesh(armGeo, armMat);
  rArm.position.set(0.34, 0.15, 0);
  rArm.rotation.z = -0.18;
  rArm.name = 'RightArm';
  g.add(rArm);

  // Hands
  const handMat = new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.55, name: 'skin' });
  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), handMat);
  lHand.position.set(-0.42, -0.04, 0);
  lHand.name = 'LeftHand';
  g.add(lHand);
  const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), handMat);
  rHand.position.set(0.42, -0.04, 0);
  rHand.name = 'RightHand';
  g.add(rHand);

  // Legs
  const legGeo = new THREE.CapsuleGeometry(0.11, 0.28, 8, 16);
  const pantsMat = new THREE.MeshStandardMaterial({ color: COLORS.pants, roughness: 0.75, name: 'pants' });
  const lLeg = new THREE.Mesh(legGeo, pantsMat);
  lLeg.position.set(-0.15, -0.32, 0);
  lLeg.name = 'LeftLeg';
  g.add(lLeg);
  const rLeg = new THREE.Mesh(legGeo, pantsMat);
  rLeg.position.set(0.15, -0.32, 0);
  rLeg.name = 'RightLeg';
  g.add(rLeg);

  // Shoes
  const shoeMat = new THREE.MeshStandardMaterial({ color: COLORS.shoe, roughness: 0.6, name: 'shoe' });
  const lShoe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), shoeMat);
  lShoe.scale.set(1.0, 0.7, 1.4);
  lShoe.position.set(-0.15, -0.55, 0.05);
  lShoe.name = 'LeftShoe';
  g.add(lShoe);
  const rShoe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), shoeMat);
  rShoe.scale.set(1.0, 0.7, 1.4);
  rShoe.position.set(0.15, -0.55, 0.05);
  rShoe.name = 'RightShoe';
  g.add(rShoe);

  return g;
}

async function main() {
  const chibi = makeChibi();
  const exporter = new GLTFExporter();

  const result = await new Promise((resolveGLB, reject) => {
    exporter.parse(
      chibi,
      (gltf) => resolveGLB(gltf),
      (err) => reject(err),
      { binary: true, embedImages: true, onlyVisible: true }
    );
  });

  // result is ArrayBuffer when binary: true
  const buf = Buffer.from(result);
  writeFileSync(outPath, buf);
  console.log(`✅ wrote ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error('GLB export failed:', e);
  process.exit(1);
});
