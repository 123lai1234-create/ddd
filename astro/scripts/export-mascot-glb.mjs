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
  hair:    0x1a0e08,
  shirt:   0xf2f0ec,
  pants:   0xa02a2a,
  flannel: 0x6e1a1a,
  eye:     0x0c0a0a,
  eyeWhite:0xffffff,
  cheek:   0xff7a8a,
  shoe:    0x141414,
  shoeSole:0xeeeeec,
  mouth:   0x402828,
};

function makeChibi() {
  const g = new THREE.Group();
  g.name = 'ChibiMascot';

  // Head (bigger chibi proportions)
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 36, 32),
    new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.55, metalness: 0, name: 'skin' })
  );
  head.scale.set(1.0, 0.96, 1.0);
  head.position.y = 0.85;
  head.name = 'Head';
  g.add(head);

  // Hair base cap
  const hairMat = new THREE.MeshStandardMaterial({ color: COLORS.hair, roughness: 0.9, metalness: 0, name: 'hair' });
  const hairBase = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2),
    hairMat
  );
  hairBase.position.y = 0.85;
  hairBase.name = 'HairBase';
  g.add(hairBase);

  // (no back hair — was wrapping around the face and covering it)

  // Bangs (raised so doesn't cover eyes)
  const bangs = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    hairMat
  );
  bangs.position.set(0, 0.92, 0.30);
  bangs.scale.set(1.3, 0.4, 0.6);
  bangs.name = 'Bangs';
  g.add(bangs);

  // Spiky tufts (cones, taller and more visible)
  const spikeGeo = new THREE.ConeGeometry(0.13, 0.34, 8);
  const spikePositions = [
    { x:  0.0,  y: 1.36, z:  0.05, rx:  0.25, rz:  0.00, s: 1.0,  n: 'SpikeA' },
    { x: -0.22, y: 1.28, z:  0.10, rx:  0.20, rz:  0.40, s: 0.95, n: 'SpikeB' },
    { x:  0.24, y: 1.26, z:  0.10, rx:  0.20, rz: -0.45, s: 0.95, n: 'SpikeC' },
    { x: -0.36, y: 1.10, z:  0.12, rx:  0.10, rz:  0.65, s: 0.80, n: 'SpikeD' },
    { x:  0.38, y: 1.10, z:  0.12, rx:  0.10, rz: -0.70, s: 0.80, n: 'SpikeE' },
    { x: -0.12, y: 1.36, z: -0.20, rx: -0.55, rz:  0.10, s: 0.85, n: 'SpikeF' },
    { x:  0.14, y: 1.34, z: -0.20, rx: -0.55, rz: -0.10, s: 0.85, n: 'SpikeG' },
    { x:  0.0,  y: 1.42, z:  0.00, rx:  0.40, rz:  0.10, s: 0.75, n: 'SpikeH' },
  ];
  for (const p of spikePositions) {
    const s = new THREE.Mesh(spikeGeo, hairMat);
    s.position.set(p.x, p.y, p.z);
    s.rotation.set(p.rx, 0, p.rz);
    s.scale.setScalar(p.s);
    s.name = p.n;
    g.add(s);
  }
  // Small side fuzz
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const fuzz = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), hairMat);
    fuzz.position.set(Math.cos(a) * 0.52, 1.05 + Math.sin(i) * 0.05, Math.sin(a) * 0.52);
    fuzz.name = `Fuzz${i}`;
    g.add(fuzz);
  }

  // Eyes (bigger, expressive)
  function makeEye(x) {
    const eye = new THREE.Group();
    eye.name = x < 0 ? 'LeftEye' : 'RightEye';
    const w = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 22, 22),
      new THREE.MeshStandardMaterial({ color: COLORS.eyeWhite, roughness: 0.25, metalness: 0, name: 'eyeWhite' })
    );
    w.scale.set(1, 1.1, 0.6);
    w.name = 'White';
    eye.add(w);
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 18, 18),
      new THREE.MeshStandardMaterial({ color: COLORS.eye, roughness: 0.15, name: 'eye' })
    );
    p.position.z = 0.05;
    p.name = 'Pupil';
    eye.add(p);
    const h = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.1, name: 'highlight' })
    );
    h.position.set(0.025, 0.03, 0.085);
    h.name = 'Highlight';
    eye.add(h);
    eye.position.set(x, 0.88, 0.5);
    return eye;
  }
  g.add(makeEye(-0.19));
  g.add(makeEye(0.19));

  // Cheeks
  const cheekMat = new THREE.MeshStandardMaterial({
    color: COLORS.cheek, roughness: 0.9, transparent: true, opacity: 0.7, name: 'cheek'
  });
  const lCheek = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 14), cheekMat);
  lCheek.position.set(-0.38, 0.74, 0.42);
  lCheek.scale.set(1.1, 0.7, 0.3);
  lCheek.name = 'LeftCheek';
  g.add(lCheek);
  const rCheek = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 14), cheekMat);
  rCheek.position.set(0.38, 0.74, 0.42);
  rCheek.scale.set(1.1, 0.7, 0.3);
  rCheek.name = 'RightCheek';
  g.add(rCheek);

  // Mouth
  const mouthMat = new THREE.MeshStandardMaterial({ color: COLORS.mouth, roughness: 0.5, name: 'mouth' });
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), mouthMat);
  mouth.position.set(0, 0.66, 0.58);
  mouth.scale.set(1.5, 0.6, 0.4);
  mouth.name = 'Mouth';
  g.add(mouth);

  // Nose
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 8, 8),
    new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.6, name: 'skin' })
  );
  nose.position.set(0, 0.77, 0.6);
  nose.name = 'Nose';
  g.add(nose);

  // Ears
  const earMat = new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.55, name: 'skin' });
  const lEar = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), earMat);
  lEar.position.set(-0.55, 0.78, 0.05);
  lEar.scale.set(0.5, 1, 0.7);
  lEar.name = 'LeftEar';
  g.add(lEar);
  const rEar = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), earMat);
  rEar.position.set(0.55, 0.78, 0.05);
  rEar.scale.set(0.5, 1, 0.7);
  rEar.name = 'RightEar';
  g.add(rEar);

  // Body (white t-shirt)
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.34, 0.55, 24),
    new THREE.MeshStandardMaterial({ color: COLORS.shirt, roughness: 0.7, name: 'shirt' })
  );
  body.position.y = 0.3;
  body.name = 'Body';
  g.add(body);

  // Flannel tied at waist
  const flannelMat = new THREE.MeshStandardMaterial({ color: COLORS.flannel, roughness: 0.85, name: 'flannel' });
  const flannelBelt = new THREE.Mesh(
    new THREE.TorusGeometry(0.36, 0.04, 8, 24),
    flannelMat
  );
  flannelBelt.position.y = 0.05;
  flannelBelt.rotation.x = Math.PI / 2;
  flannelBelt.name = 'FlannelBelt';
  g.add(flannelBelt);
  const knot = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.12, 0.08),
    flannelMat
  );
  knot.position.set(0, 0.0, 0.32);
  knot.name = 'FlannelKnot';
  g.add(knot);
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.22, 0.04),
    flannelMat
  );
  tail.position.set(0.16, -0.12, 0.32);
  tail.rotation.z = 0.25;
  tail.name = 'FlannelTail';
  g.add(tail);

  // Upper arms (shirt sleeves)
  const shirtMat = new THREE.MeshStandardMaterial({ color: COLORS.shirt, roughness: 0.7, name: 'shirt' });
  const upperArmGeo = new THREE.CapsuleGeometry(0.085, 0.12, 8, 16);
  const lUpper = new THREE.Mesh(upperArmGeo, shirtMat);
  lUpper.position.set(-0.36, 0.36, 0);
  lUpper.rotation.z = 0.3;
  lUpper.name = 'LeftUpperArm';
  g.add(lUpper);
  const rUpper = new THREE.Mesh(upperArmGeo, shirtMat);
  rUpper.position.set(0.36, 0.36, 0);
  rUpper.rotation.z = -0.3;
  rUpper.name = 'RightUpperArm';
  g.add(rUpper);

  // Lower arms (skin)
  const armGeo = new THREE.CapsuleGeometry(0.07, 0.18, 8, 16);
  const armMat = new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.55, name: 'skin' });
  const lArm = new THREE.Mesh(armGeo, armMat);
  lArm.position.set(-0.44, 0.16, 0);
  lArm.rotation.z = 0.18;
  lArm.name = 'LeftArm';
  g.add(lArm);
  const rArm = new THREE.Mesh(armGeo, armMat);
  rArm.position.set(0.44, 0.16, 0);
  rArm.rotation.z = -0.18;
  rArm.name = 'RightArm';
  g.add(rArm);

  // Hands
  const handMat = new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.55, name: 'skin' });
  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), handMat);
  lHand.position.set(-0.50, -0.02, 0);
  lHand.name = 'LeftHand';
  g.add(lHand);
  const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), handMat);
  rHand.position.set(0.50, -0.02, 0);
  rHand.name = 'RightHand';
  g.add(rHand);

  // Legs (maroon baggy pants)
  const upperLegGeo = new THREE.CapsuleGeometry(0.13, 0.18, 8, 16);
  const pantsMat = new THREE.MeshStandardMaterial({ color: COLORS.pants, roughness: 0.8, name: 'pants' });
  const lUpperLeg = new THREE.Mesh(upperLegGeo, pantsMat);
  lUpperLeg.position.set(-0.18, -0.18, 0);
  lUpperLeg.name = 'LeftUpperLeg';
  g.add(lUpperLeg);
  const rUpperLeg = new THREE.Mesh(upperLegGeo, pantsMat);
  rUpperLeg.position.set(0.18, -0.18, 0);
  rUpperLeg.name = 'RightUpperLeg';
  g.add(rUpperLeg);
  const lowerLegGeo = new THREE.CapsuleGeometry(0.085, 0.18, 8, 16);
  const lLowerLeg = new THREE.Mesh(lowerLegGeo, pantsMat);
  lLowerLeg.position.set(-0.18, -0.42, 0);
  lLowerLeg.name = 'LeftLowerLeg';
  g.add(lLowerLeg);
  const rLowerLeg = new THREE.Mesh(lowerLegGeo, pantsMat);
  rLowerLeg.position.set(0.18, -0.42, 0);
  rLowerLeg.name = 'RightLowerLeg';
  g.add(rLowerLeg);

  // Black chunky sneakers
  const shoeMat = new THREE.MeshStandardMaterial({ color: COLORS.shoe, roughness: 0.55, name: 'shoe' });
  const soleMat = new THREE.MeshStandardMaterial({ color: COLORS.shoeSole, roughness: 0.6, name: 'sole' });
  function makeShoe(x) {
    const shoe = new THREE.Group();
    shoe.name = x < 0 ? 'LeftShoe' : 'RightShoe';
    const main = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), shoeMat);
    main.scale.set(1.05, 0.7, 1.5);
    main.name = 'Main';
    shoe.add(main);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.36), soleMat);
    sole.position.set(0, -0.09, 0.02);
    sole.name = 'Sole';
    shoe.add(sole);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.04, 0.02), soleMat);
    stripe.position.set(0, 0.0, 0.16);
    stripe.name = 'Stripe';
    shoe.add(stripe);
    shoe.position.set(x, -0.62, 0.04);
    return shoe;
  }
  g.add(makeShoe(-0.18));
  g.add(makeShoe(0.18));

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
