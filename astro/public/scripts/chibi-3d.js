/**
 * chibi-3d.js — Three.js procedural chibi character (元嬰不說 mascot)
 *
 * Why: GLB multi-view reconstruction (mc320) produced a stone-like rough surface,
 *      not a doll. This script builds a smooth stylized chibi from Three.js
 *      primitives (sphere head, capsule limbs) with the same color palette as
 *      the 2D illustration (dark hair, peach skin, blue shirt, dark pants).
 *
 * Usage:
 *   <canvas id="kawaii-canvas" width="124" height="124"></canvas>
 *   <script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
 *   <script src="/scripts/chibi-3d.js"></script>
 *   <script>
 *     Chibi3D.mount('kawaii-canvas', { size: 124 });
 *     Chibi3D.setView('front');           // 'front' | 'side' | 'back'
 *   </script>
 *
 * API:
 *   mount(canvasId, opts) -> renderer handle
 *   setView(name)          rotate camera to front/side/back
 *   dispose(canvasId)      tear down (for SPA navigation)
 *
 * 2026-10-13: 2D views replaced with real 3D Three.js scene.
 */
(function () {
  'use strict';

  const VIEWS = {
    front: { x: 0,    y: 0.45, z: 3.4, ly: 0.45 },
    side:  { x: 3.4,  y: 0.45, z: 0,   ly: 0.45 },
    back:  { x: 0,    y: 0.45, z: -3.4,ly: 0.45 },
    top:   { x: 0,    y: 3.2,  z: 0.5, ly: 0 },
  };
  const AUTO_ROTATE_DEG_PER_SEC = 6; // very gentle; state changes override
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

    // === Head (slightly squashed sphere for chibi proportions) ===
    const headGeo = new THREE.SphereGeometry(0.55, 32, 28);
    const skinMat = new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.55, metalness: 0 });
    const head = new THREE.Mesh(headGeo, skinMat);
    head.scale.set(1.0, 0.95, 1.0); // slightly squashed
    head.position.y = 0.75;
    g.add(head);

    // === Hair: hemisphere on top + back fringe ===
    const hairMat = new THREE.MeshStandardMaterial({ color: COLORS.hair, roughness: 0.85, metalness: 0 });
    // top cap
    const hairTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.57, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      hairMat
    );
    hairTop.position.y = 0.75;
    g.add(hairTop);
    // back fringe (extends down behind head)
    const hairBack = new THREE.Mesh(
      new THREE.SphereGeometry(0.58, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      hairMat
    );
    hairBack.position.y = 0.55;
    hairBack.scale.set(1.02, 0.7, 1.02);
    g.add(hairBack);
    // bangs (front fringe)
    const bangs = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      hairMat
    );
    bangs.position.set(0, 0.7, 0.32);
    bangs.scale.set(1.2, 0.7, 0.7);
    g.add(bangs);

    // === Eyes (sphere with white + small black pupil) ===
    function makeEye(x) {
      const eye = new THREE.Group();
      const w = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 18, 18),
        new THREE.MeshStandardMaterial({ color: COLORS.eyeWhite, roughness: 0.3 })
      );
      eye.add(w);
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 12, 12),
        new THREE.MeshStandardMaterial({ color: COLORS.eye, roughness: 0.2 })
      );
      p.position.z = 0.045;
      eye.add(p);
      eye.position.set(x, 0.78, 0.5);
      return eye;
    }
    g.add(makeEye(-0.16));
    g.add(makeEye(0.16));

    // === Cheeks (small pink discs) ===
    const cheekMat = new THREE.MeshStandardMaterial({
      color: COLORS.cheek, roughness: 0.9, transparent: true, opacity: 0.55,
    });
    const leftCheek = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), cheekMat);
    leftCheek.position.set(-0.32, 0.66, 0.46);
    leftCheek.scale.set(1, 0.6, 0.3);
    g.add(leftCheek);
    const rightCheek = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), cheekMat);
    rightCheek.position.set(0.32, 0.66, 0.46);
    rightCheek.scale.set(1, 0.6, 0.3);
    g.add(rightCheek);

    // === Body (shirt: tapered cylinder) ===
    const bodyGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.6, 24);
    const shirtMat = new THREE.MeshStandardMaterial({ color: COLORS.shirt, roughness: 0.7 });
    const body = new THREE.Mesh(bodyGeo, shirtMat);
    body.position.y = 0.2;
    g.add(body);

    // === Arms (capsules) ===
    const armGeo = new THREE.CapsuleGeometry(0.08, 0.3, 8, 16);
    const armMat = new THREE.MeshStandardMaterial({ color: COLORS.shirt, roughness: 0.7 });
    const lArm = new THREE.Mesh(armGeo, armMat);
    lArm.position.set(-0.34, 0.15, 0);
    lArm.rotation.z = 0.18;
    g.add(lArm);
    const rArm = new THREE.Mesh(armGeo, armMat);
    rArm.position.set(0.34, 0.15, 0);
    rArm.rotation.z = -0.18;
    g.add(rArm);

    // hands (skin tone)
    const handMat = new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.55 });
    const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), handMat);
    lHand.position.set(-0.42, -0.04, 0);
    g.add(lHand);
    const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), handMat);
    rHand.position.set(0.42, -0.04, 0);
    g.add(rHand);

    // === Legs (capsules, slightly bowed) ===
    const legGeo = new THREE.CapsuleGeometry(0.11, 0.28, 8, 16);
    const pantsMat = new THREE.MeshStandardMaterial({ color: COLORS.pants, roughness: 0.75 });
    const lLeg = new THREE.Mesh(legGeo, pantsMat);
    lLeg.position.set(-0.15, -0.32, 0);
    g.add(lLeg);
    const rLeg = new THREE.Mesh(legGeo, pantsMat);
    rLeg.position.set(0.15, -0.32, 0);
    g.add(rLeg);

    // shoes
    const shoeMat = new THREE.MeshStandardMaterial({ color: COLORS.shoe, roughness: 0.6 });
    const lShoe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), shoeMat);
    lShoe.scale.set(1.0, 0.7, 1.4);
    lShoe.position.set(-0.15, -0.55, 0.05);
    g.add(lShoe);
    const rShoe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), shoeMat);
    rShoe.scale.set(1.0, 0.7, 1.4);
    rShoe.position.set(0.15, -0.55, 0.05);
    g.add(rShoe);

    return g;
  }

  function makeScene(canvas, opts) {
    const W = opts.size || 124;
    const H = opts.size || 124;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(W, H, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0); // transparent

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0.45, 3.4);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xfff4e0, 0.95);
    key.position.set(2, 3, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xa0c0ff, 0.35);
    fill.position.set(-2, 1, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd0a0, 0.25);
    rim.position.set(0, 2, -3);
    scene.add(rim);

    const chibi = makeChibi();
    scene.add(chibi);

    // State
    const state = {
      currentView: 'front',
      targetPos:   { x: 0, y: 0.45, z: 3.4 },
      currentPos:  { x: 0, y: 0.45, z: 3.4 },
      autoRotate:  true,
      lastTs:      performance.now(),
      animating:   false,
    };

    function setView(name) {
      const v = VIEWS[name];
      if (!v) return;
      state.currentView = name;
      state.targetPos = { x: v.x, y: v.y, z: v.z };
      state.animating = true;
    }

    // Animate camera position with ease-out
    function tick() {
      const now = performance.now();
      const dt = Math.min(0.1, (now - state.lastTs) / 1000);
      state.lastTs = now;

      if (state.animating) {
        const t = 0.18; // smoothing time
        const a = 1 - Math.exp(-dt / t);
        state.currentPos.x += (state.targetPos.x - state.currentPos.x) * a;
        state.currentPos.y += (state.targetPos.y - state.currentPos.y) * a;
        state.currentPos.z += (state.targetPos.z - state.currentPos.z) * a;
        if (Math.abs(state.currentPos.x - state.targetPos.x) < 0.01 &&
            Math.abs(state.currentPos.y - state.targetPos.y) < 0.01 &&
            Math.abs(state.currentPos.z - state.targetPos.z) < 0.01) {
          state.animating = false;
        }
      }
      camera.position.set(state.currentPos.x, state.currentPos.y, state.currentPos.z);
      // camera always looks at chest level
      camera.lookAt(0, 0.35, 0);

      // Auto-rotate by spinning the chibi itself (so face still shows the view)
      if (state.autoRotate) {
        chibi.rotation.y += THREE.MathUtils.degToRad(AUTO_ROTATE_DEG_PER_SEC) * dt;
      }

      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }
    tick();

    return { renderer, scene, camera, chibi, state, setView };
  }

  const mounted = new Map();
  function mount(canvasId, opts = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) { console.warn('Chibi3D: canvas not found', canvasId); return null; }
    // already mounted? tear down first
    if (mounted.has(canvasId)) dispose(canvasId);
    const handle = makeScene(canvas, opts);
    mounted.set(canvasId, handle);
    return handle;
  }
  function setView(name) {
    for (const h of mounted.values()) h.setView(name);
  }
  function dispose(canvasId) {
    const h = mounted.get(canvasId);
    if (!h) return;
    h.renderer.dispose();
    h.renderer.forceContextLoss && h.renderer.forceContextLoss();
    mounted.delete(canvasId);
  }

  window.Chibi3D = { mount, setView, dispose, VIEWS };
})();
