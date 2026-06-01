/**
 * Interactive Showcase — 全景互動技術展示
 * Three.js · Canvas 2D · Web Animations API · GSAP ScrollTrigger
 * Parallax · Micro-interactions · Intersection Observer · Web Speech API
 * SSE/WebSocket · A-Frame VR · WebAssembly · PWA
 */

/* ── Lazy CDN loader ──────────────────────────────────────── */
const _loaded = new Set();
function loadScript(url, id) {
  if (_loaded.has(id || url)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url; s.async = true;
    s.onload = () => { _loaded.add(id || url); resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/* ════════════════════════════════════════════════════════════
   01. THREE.JS — DNA Double Helix Hero
   ════════════════════════════════════════════════════════════ */
async function initThreeHero() {
  const canvas = document.getElementById('threejs-canvas');
  if (!canvas) return;
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js', 'three');
    if (!window.THREE) return;
    const { THREE } = window;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 22);

    // Resize handler
    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(canvas);
    resize();

    // DNA double helix
    const helixGroup = new THREE.Group();
    scene.add(helixGroup);

    const sphereGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const matA = new THREE.MeshBasicMaterial({ color: 0x58d7ff });
    const matB = new THREE.MeshBasicMaterial({ color: 0xb59cff });
    const matBond = new THREE.MeshBasicMaterial({ color: 0x7bf0be, transparent: true, opacity: 0.5 });
    const cylinderGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 6);

    const STEPS = 60;
    const RADIUS = 3.5;
    const HEIGHT = 20;
    const TURNS = 4;

    for (let i = 0; i < STEPS; i++) {
      const t = i / STEPS;
      const angle = t * Math.PI * 2 * TURNS;
      const y = (t - 0.5) * HEIGHT;

      // Strand A
      const xA = Math.cos(angle) * RADIUS;
      const zA = Math.sin(angle) * RADIUS;
      const mA = new THREE.Mesh(sphereGeo, matA.clone());
      mA.position.set(xA, y, zA);
      helixGroup.add(mA);

      // Strand B (opposite)
      const xB = Math.cos(angle + Math.PI) * RADIUS;
      const zB = Math.sin(angle + Math.PI) * RADIUS;
      const mB = new THREE.Mesh(sphereGeo, matB.clone());
      mB.position.set(xB, y, zB);
      helixGroup.add(mB);

      // Cross bond every ~4 steps
      if (i % 4 === 0) {
        const mid = new THREE.Vector3((xA + xB) / 2, y, (zA + zB) / 2);
        const dist = Math.sqrt((xB - xA) ** 2 + (zB - zA) ** 2);
        const bond = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, dist, 6),
          matBond
        );
        bond.position.copy(mid);
        bond.lookAt(xB, y, zB);
        bond.rotateX(Math.PI / 2);
        helixGroup.add(bond);
      }
    }

    // Ambient + point lights (not needed for Basic material, but kept for future)
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    // Mouse interaction
    let mouseX = 0, mouseY = 0;
    document.addEventListener('mousemove', e => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    // Animation loop
    let frame = 0;
    const animate = () => {
      requestAnimationFrame(animate);
      frame++;
      helixGroup.rotation.y += 0.006;
      helixGroup.rotation.x += (mouseY * 0.3 - helixGroup.rotation.x) * 0.05;
      helixGroup.position.x += (mouseX * 2 - helixGroup.position.x) * 0.04;
      renderer.render(scene, camera);
    };
    animate();
  } catch(e) { console.warn('Three.js unavailable', e); }
}

/* ════════════════════════════════════════════════════════════
   02. WEB ANIMATIONS API
   ════════════════════════════════════════════════════════════ */
function initWebAnimationsAPI() {
  const molecule = document.getElementById('waa-molecule');
  if (!molecule) return;

  const anim = molecule.animate([
    { transform: 'rotate(0deg) scale(1)',   opacity: 0.8 },
    { transform: 'rotate(90deg) scale(1.2)', opacity: 1   },
    { transform: 'rotate(180deg) scale(0.9)', opacity: 0.9 },
    { transform: 'rotate(270deg) scale(1.15)', opacity: 1  },
    { transform: 'rotate(360deg) scale(1)',   opacity: 0.8 },
  ], {
    duration: 3000,
    iterations: Infinity,
    easing: 'ease-in-out',
  });

  const stateEl = document.getElementById('waa-state');
  const rateEl  = document.getElementById('waa-rate');
  const timeEl  = document.getElementById('waa-time');

  const updateInfo = () => {
    stateEl.textContent = `狀態：${anim.playState}`;
    rateEl.textContent  = `速率：${anim.playbackRate}×`;
  };

  setInterval(() => {
    if (anim.currentTime !== null)
      timeEl.textContent = `進度：${Math.round(anim.currentTime % 3000)} ms`;
  }, 100);

  document.getElementById('waa-play')?.addEventListener('click', () => { anim.play(); updateInfo(); });
  document.getElementById('waa-pause')?.addEventListener('click', () => { anim.pause(); updateInfo(); });
  document.getElementById('waa-reverse')?.addEventListener('click', () => { anim.reverse(); updateInfo(); });
  document.getElementById('waa-slow')?.addEventListener('click', () => { anim.playbackRate = 0.3; updateInfo(); });
  document.getElementById('waa-fast')?.addEventListener('click', () => { anim.playbackRate = 3; updateInfo(); });
}

/* ════════════════════════════════════════════════════════════
   03. CANVAS 2D — Drawing / Physics / Fractal
   ════════════════════════════════════════════════════════════ */
function initCanvas2D() {
  // Tab switching
  const tabs = document.querySelectorAll('[data-canvas-tab]');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('[id^="canvas-tab-"]').forEach(el => el.classList.add('hidden'));
      const target = document.getElementById(`canvas-tab-${btn.dataset.canvasTab}`);
      if (target) target.classList.remove('hidden');
      if (btn.dataset.canvasTab === 'fractal') renderFractal();
      if (btn.dataset.canvasTab === 'particles') initPhysicsCanvas();
    });
  });

  initDrawingCanvas();
  initFractalCanvas();
}

function initDrawingCanvas() {
  const canvas = document.getElementById('drawing-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const resize = () => {
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = w; canvas.height = h;
    ctx.fillStyle = '#060a0e';
    ctx.fillRect(0, 0, w, h);
    ctx.putImageData(img, 0, 0);
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  let drawing = false, eraser = false;
  let lastX = 0, lastY = 0;

  const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return [src.clientX - r.left, src.clientY - r.top];
  };

  const startDraw = (e) => {
    drawing = true;
    [lastX, lastY] = getPos(e);
  };

  const draw = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const [x, y] = getPos(e);
    const color = document.getElementById('brush-color')?.value || '#58d7ff';
    const size  = parseInt(document.getElementById('brush-size')?.value || '6');

    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    [lastX, lastY] = [x, y];
  };

  const stopDraw = () => { drawing = false; };

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDraw);
  canvas.addEventListener('mouseleave', stopDraw);
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDraw);

  document.getElementById('brush-size')?.addEventListener('input', e => {
    document.getElementById('brush-size-val').textContent = e.target.value;
  });

  document.getElementById('draw-mode-pen')?.addEventListener('click', () => { eraser = false; });
  document.getElementById('draw-mode-eraser')?.addEventListener('click', () => { eraser = true; });

  document.getElementById('draw-clear')?.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#060a0e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  });

  document.getElementById('draw-save')?.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'showcase-drawing.png';
    a.click();
  });
}

/* Physics Canvas */
let physicsRunning = false;
let physicsRaf;

function initPhysicsCanvas() {
  const canvas = document.getElementById('physics-canvas');
  if (!canvas || physicsRunning) return;
  physicsRunning = true;

  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  let gravity = true;
  const particles = [];

  const COLORS = ['#58d7ff','#b59cff','#7bf0be','#ffd080','#ff8080'];

  class Particle {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.vx = (Math.random() - 0.5) * 8;
      this.vy = (Math.random() - 0.5) * 8 - 4;
      this.r = Math.random() * 8 + 4;
      this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
      this.life = 1;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (gravity) this.vy += 0.3;
      this.vx *= 0.99;
      this.life -= 0.008;
      if (this.y + this.r > canvas.height) { this.y = canvas.height - this.r; this.vy *= -0.6; }
      if (this.x < this.r) { this.x = this.r; this.vx *= -0.8; }
      if (this.x + this.r > canvas.width) { this.x = canvas.width - this.r; this.vx *= -0.8; }
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.life);
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    for (let i = 0; i < 12; i++)
      particles.push(new Particle(e.clientX - r.left, e.clientY - r.top));
  });

  document.getElementById('particles-clear')?.addEventListener('click', () => particles.length = 0);
  document.getElementById('particles-gravity-toggle')?.addEventListener('click', function() {
    gravity = !gravity;
    this.textContent = `重力：${gravity ? '開' : '關'}`;
  });

  const loop = () => {
    physicsRaf = requestAnimationFrame(loop);
    ctx.fillStyle = 'rgba(4,8,12,0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update(); p.draw();
      if (p.life <= 0) particles.splice(i, 1);
    }
  };
  loop();
}

/* Fractal Canvas */
function initFractalCanvas() {
  document.getElementById('fractal-depth')?.addEventListener('input', e => {
    document.getElementById('fractal-depth-val').textContent = e.target.value;
  });
  document.getElementById('fractal-render')?.addEventListener('click', renderFractal);
}

function renderFractal() {
  const canvas = document.getElementById('fractal-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  const depth = parseInt(document.getElementById('fractal-depth')?.value || '7');
  const color = document.getElementById('fractal-color')?.value || '#58d7ff';

  ctx.fillStyle = '#060a0e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  function hexToRgb(h) {
    const r = parseInt(h.slice(1,3), 16);
    const g = parseInt(h.slice(3,5), 16);
    const b = parseInt(h.slice(5,7), 16);
    return { r, g, b };
  }

  const rgb = hexToRgb(color);

  function drawTree(x1, y1, x2, y2, d) {
    if (d === 0) return;
    const hue = (d / depth);
    ctx.strokeStyle = `rgba(${Math.round(rgb.r * hue + 88*(1-hue))},${Math.round(rgb.g * hue)},${Math.round(rgb.b)},${hue})`;
    ctx.lineWidth = d * 0.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const dx = x2 - x1, dy = y2 - y1;
    const angle1 =  0.5, angle2 = -0.5;
    const scale = 0.67;
    const nx1 = x2 + (dx * Math.cos(angle1) - dy * Math.sin(angle1)) * scale;
    const ny1 = y2 + (dx * Math.sin(angle1) + dy * Math.cos(angle1)) * scale;
    const nx2 = x2 + (dx * Math.cos(angle2) - dy * Math.sin(angle2)) * scale;
    const ny2 = y2 + (dx * Math.sin(angle2) + dy * Math.cos(angle2)) * scale;
    drawTree(x2, y2, nx1, ny1, d - 1);
    drawTree(x2, y2, nx2, ny2, d - 1);
  }

  const cx = canvas.width / 2;
  const cy = canvas.height;
  const trunkH = canvas.height * 0.22;
  drawTree(cx, cy, cx, cy - trunkH, depth);
}

/* ════════════════════════════════════════════════════════════
   04. GSAP SCROLLTRIGGER — Timeline Steps
   ════════════════════════════════════════════════════════════ */
async function initScrollTimeline() {
  // Scroll progress bar
  const bar = document.getElementById('scroll-progress-bar');
  if (bar) {
    window.addEventListener('scroll', () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = `${(window.scrollY / total * 100).toFixed(1)}%`;
    }, { passive: true });
  }

  // Timeline steps via IntersectionObserver (fallback if GSAP unavailable)
  const steps = document.querySelectorAll('.tl-step');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.3 });
  steps.forEach(s => obs.observe(s));

  // Try GSAP for enhanced version
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js', 'gsap');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js', 'scrolltrigger');
    if (!window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);

    steps.forEach((el, i) => {
      gsap.from(el, {
        x: -30, opacity: 0, duration: 0.6,
        delay: i * 0.1,
        scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' },
      });
    });
  } catch { /* GSAP unavailable */ }
}

/* ════════════════════════════════════════════════════════════
   05. PARALLAX
   ════════════════════════════════════════════════════════════ */
function initParallax() {
  // Generate stars
  const starsField = document.getElementById('stars-field');
  if (starsField) {
    for (let i = 0; i < 80; i++) {
      const star = document.createElement('div');
      star.className = 'star';
      const size = Math.random() * 2.5 + 0.5;
      const opacity = Math.random() * 0.6 + 0.1;
      const dur = (Math.random() * 4 + 2).toFixed(1);
      star.style.cssText = `
        width:${size}px; height:${size}px;
        left:${Math.random()*100}%;
        top:${Math.random()*100}%;
        --op:${opacity}; --dur:${dur}s;
        animation-delay:${(Math.random()*4).toFixed(1)}s;
      `;
      starsField.appendChild(star);
    }
  }

  // Parallax scroll
  const layers = document.querySelectorAll('.parallax-layer');
  if (!layers.length) return;

  const section = document.querySelector('.parallax-section');
  if (!section) return;

  window.addEventListener('scroll', () => {
    const rect = section.getBoundingClientRect();
    const progress = -rect.top / (window.innerHeight + section.offsetHeight);
    layers.forEach(layer => {
      const speed = parseFloat(layer.dataset.speed || '0.5');
      const offset = progress * speed * 200;
      layer.style.transform = `translateY(${offset}px)`;
    });
  }, { passive: true });
}

/* ════════════════════════════════════════════════════════════
   06. MICRO-INTERACTIONS
   ════════════════════════════════════════════════════════════ */
function initMicroInteractions() {
  // Ripple effect
  document.querySelectorAll('.ripple-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      const r = this.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2;
      const wave = document.createElement('span');
      wave.className = 'ripple-wave';
      wave.style.cssText = `
        width: ${size}px; height: ${size}px;
        left: ${e.clientX - r.left - size/2}px;
        top: ${e.clientY - r.top - size/2}px;
      `;
      this.appendChild(wave);
      wave.addEventListener('animationend', () => wave.remove());
    });
  });

  // Morph button
  const morphBtn = document.getElementById('morph-btn');
  if (morphBtn) {
    morphBtn.addEventListener('click', () => {
      morphBtn.classList.toggle('morphed');
      morphBtn.querySelector('span').textContent = morphBtn.classList.contains('morphed') ? '已變形 ✓' : '點擊變形';
    });
  }

  // Like buttons
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const heart = this.querySelector('.heart-icon');
      const count = this.querySelector('.like-count');
      const isLiked = this.classList.toggle('liked');
      heart.textContent = isLiked ? '♥' : '♡';
      const current = parseInt(count.textContent);
      count.textContent = isLiked ? current + 1 : current - 1;

      if (isLiked) {
        // Particle burst
        for (let i = 0; i < 6; i++) {
          const p = document.createElement('span');
          p.textContent = '❤';
          p.style.cssText = `
            position:absolute; font-size:0.7rem; pointer-events:none;
            animation: likeParticle 0.8s ease-out forwards;
            top: 50%; left: 50%;
            transform-origin: center;
            --dx:${(Math.random()-0.5)*60}px;
            --dy:${-(Math.random()*40+20)}px;
          `;
          this.style.position = 'relative';
          this.appendChild(p);
          p.addEventListener('animationend', () => p.remove());
        }
      }
    });
  });

  // Magnetic button
  const magBtn = document.getElementById('magnetic-btn');
  if (magBtn) {
    magBtn.addEventListener('mousemove', function(e) {
      const r = this.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) * 0.25;
      const dy = (e.clientY - cy) * 0.25;
      this.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    magBtn.addEventListener('mouseleave', function() {
      this.style.transform = 'translate(0, 0)';
    });
  }

  // Skeleton toggle
  const skToggle = document.getElementById('skeleton-toggle');
  if (skToggle) {
    const skDemo = skToggle.previousElementSibling;
    let loaded = false;
    skToggle.addEventListener('click', () => {
      if (!loaded) {
        loaded = true;
        skToggle.textContent = '已載入';
        if (skDemo) {
          skDemo.innerHTML = `
            <img src="https://picsum.photos/seed/sk1/48/48" style="width:48px;height:48px;border-radius:50%;object-fit:cover" alt="">
            <div style="display:flex;flex-direction:column;gap:6px;flex:1">
              <p style="font-size:0.88rem;font-weight:600">JT Lai</p>
              <p style="font-size:0.78rem;color:var(--muted)">生醫工程師 · AI 研究員</p>
              <p style="font-size:0.8rem">蛋白質結構預測與 NGS 分析</p>
            </div>
          `;
          skDemo.style.display = 'flex';
          skDemo.style.gap = '16px';
          skDemo.style.alignItems = 'center';
        }
      } else {
        loaded = false;
        skToggle.textContent = '模擬載入';
        if (skDemo) {
          skDemo.innerHTML = `
            <div class="sk-avatar"></div>
            <div class="sk-lines">
              <div class="sk-line sk-w80"></div>
              <div class="sk-line sk-w60"></div>
              <div class="sk-line sk-w90"></div>
            </div>
          `;
        }
      }
    });
  }

  // Cursor trail
  const trailDemo = document.getElementById('cursor-trail-demo');
  if (trailDemo) {
    trailDemo.addEventListener('mousemove', e => {
      const r = trailDemo.getBoundingClientRect();
      const colors = ['#58d7ff','#b59cff','#7bf0be','#ffd080'];
      const p = document.createElement('div');
      p.className = 'trail-particle';
      p.style.cssText = `
        left:${e.clientX - r.left}px;
        top:${e.clientY - r.top}px;
        background:${colors[Math.floor(Math.random()*colors.length)]};
        width:${Math.random()*8+4}px;
        height:${Math.random()*8+4}px;
      `;
      trailDemo.appendChild(p);
      p.addEventListener('animationend', () => p.remove());
    });
  }
}

// Inject like particle keyframe
const likeStyle = document.createElement('style');
likeStyle.textContent = `
  @keyframes likeParticle {
    0%   { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0); opacity: 0; }
  }
`;
document.head.appendChild(likeStyle);

/* ════════════════════════════════════════════════════════════
   07. INTERSECTION OBSERVER — Count-up + Lazy Load
   ════════════════════════════════════════════════════════════ */
function initIntersectionObserver() {
  // Count-up animation
  const statCards = document.querySelectorAll('.io-animate');
  const countObs = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      obs.unobserve(entry.target);
      entry.target.classList.add('io-fired');
      const el = entry.target;
      const target = parseFloat(el.dataset.target);
      const suffix = el.dataset.suffix || '';
      const display = el.querySelector('[data-count]');
      if (!display) return;

      const isFloat = !Number.isInteger(target);
      const duration = 1600;
      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const value = target * ease;
        display.textContent = (isFloat ? value.toFixed(1) : Math.round(value)) + suffix;
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.4 });

  statCards.forEach(el => countObs.observe(el));

  // Lazy loading images
  const lazyImgs = document.querySelectorAll('.io-lazy');
  const lazyObs = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      obs.unobserve(entry.target);
      const src = entry.target.dataset.src;
      const img = entry.target.querySelector('.lazy-img');
      const placeholder = entry.target.querySelector('.lazy-placeholder');
      if (!img || !src) return;
      img.src = src;
      img.onload = () => {
        img.classList.add('loaded');
        if (placeholder) placeholder.style.opacity = '0';
      };
    });
  }, { rootMargin: '100px' });

  lazyImgs.forEach(el => lazyObs.observe(el));
}

/* ════════════════════════════════════════════════════════════
   08. WEB SPEECH API
   ════════════════════════════════════════════════════════════ */
function initSpeechAPI() {
  initSpeechRecognition();
  initSpeechSynthesis();
}

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const startBtn = document.getElementById('speech-start-btn');
  const interimEl = document.getElementById('speech-interim');
  const finalEl = document.getElementById('speech-final');
  const statusEl = document.getElementById('speech-status');

  if (!SpeechRecognition) {
    if (statusEl) statusEl.textContent = '⚠ 此瀏覽器不支援語音辨識（請用 Chrome）';
    if (startBtn) startBtn.disabled = true;
    return;
  }

  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'zh-TW';

  let running = false;

  rec.onresult = (e) => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    if (interimEl) interimEl.textContent = interim || '...';
    if (final && finalEl) finalEl.textContent += final + ' ';
  };

  rec.onstart = () => {
    running = true;
    if (statusEl) statusEl.textContent = '🔴 錄音中...';
    if (startBtn) startBtn.textContent = '停止錄音';
  };

  rec.onend = () => {
    running = false;
    if (statusEl) statusEl.textContent = '等待中';
    if (startBtn) startBtn.textContent = '開始錄音';
  };

  rec.onerror = (e) => {
    if (statusEl) statusEl.textContent = `錯誤：${e.error}`;
    running = false;
  };

  startBtn?.addEventListener('click', () => {
    if (running) { rec.stop(); } else { rec.start(); }
  });
}

function initSpeechSynthesis() {
  const speakBtn = document.getElementById('tts-speak-btn');
  const stopBtn  = document.getElementById('tts-stop-btn');
  const rateEl   = document.getElementById('tts-rate');
  const pitchEl  = document.getElementById('tts-pitch');
  const rateVal  = document.getElementById('tts-rate-val');
  const pitchVal = document.getElementById('tts-pitch-val');
  const voiceSel = document.getElementById('tts-voice');

  if (!window.speechSynthesis) {
    if (speakBtn) { speakBtn.disabled = true; speakBtn.textContent = '不支援'; }
    return;
  }

  rateEl?.addEventListener('input', () => { rateVal.textContent = parseFloat(rateEl.value).toFixed(1); });
  pitchEl?.addEventListener('input', () => { pitchVal.textContent = parseFloat(pitchEl.value).toFixed(1); });

  const loadVoices = () => {
    const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('zh') || v.lang.startsWith('en'));
    if (!voiceSel) return;
    voiceSel.innerHTML = voices.map(v => `<option value="${v.name}">${v.name} (${v.lang})</option>`).join('');
  };
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;

  speakBtn?.addEventListener('click', () => {
    speechSynthesis.cancel();
    const text = document.getElementById('tts-input')?.value || '';
    if (!text.trim()) return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate  = parseFloat(rateEl?.value || '1');
    utt.pitch = parseFloat(pitchEl?.value || '1');
    const selectedVoice = speechSynthesis.getVoices().find(v => v.name === voiceSel?.value);
    if (selectedVoice) utt.voice = selectedVoice;
    speechSynthesis.speak(utt);
  });

  stopBtn?.addEventListener('click', () => speechSynthesis.cancel());
}

/* ════════════════════════════════════════════════════════════
   09. REAL-TIME — SSE simulation + WebSocket echo
   ════════════════════════════════════════════════════════════ */
function initRealtime() {
  initSSESimulation();
  initWebSocketEcho();
}

function initSSESimulation() {
  const startBtn = document.getElementById('sse-start');
  const stopBtn  = document.getElementById('sse-stop');
  const ticker   = document.getElementById('sse-ticker');
  const badge    = document.getElementById('sse-badge');
  let timer = null;

  const GENES = ['BRCA1','TP53','EGFR','KRAS','MYC','AKT1','MTOR','PTEN','RB1','CDK4'];
  const LEVELS = () => (Math.random() * 8 + 0.5).toFixed(2);
  const FOLD   = () => (Math.random() * 4 - 2).toFixed(2);

  const addRow = () => {
    if (!ticker) return;
    const gene   = GENES[Math.floor(Math.random() * GENES.length)];
    const level  = LEVELS();
    const fold   = parseFloat(FOLD());
    const status = fold > 0.5 ? '↑ 上調' : fold < -0.5 ? '↓ 下調' : '→ 穩定';
    const cls    = fold > 0.5 ? 'up' : fold < -0.5 ? 'down' : '';

    const row = document.createElement('div');
    row.className = `ticker-row ${cls}`;
    row.innerHTML = `<span>${gene}</span><span>${level}</span><span>${fold > 0 ? '+' : ''}${fold}</span><span>${status}</span>`;
    ticker.appendChild(row);

    // Keep max 8 rows (excluding header)
    const rows = ticker.querySelectorAll('.ticker-row:not(.ticker-header)');
    if (rows.length > 8) rows[0].remove();
    ticker.scrollTop = ticker.scrollHeight;
  };

  startBtn?.addEventListener('click', () => {
    if (timer) return;
    badge?.classList.add('online');
    if (badge) badge.textContent = '串流中';
    timer = setInterval(addRow, 800);
    addRow();
  });

  stopBtn?.addEventListener('click', () => {
    clearInterval(timer);
    timer = null;
    badge?.classList.remove('online');
    if (badge) badge.textContent = '離線';
  });
}

function initWebSocketEcho() {
  const connectBtn = document.getElementById('ws-connect');
  const sendBtn    = document.getElementById('ws-send');
  const input      = document.getElementById('ws-input');
  const chat       = document.getElementById('ws-chat');
  const badge      = document.getElementById('ws-badge');

  let connected = false;
  let echoTimer;

  const appendMsg = (text, type) => {
    if (!chat) return;
    const div = document.createElement('div');
    div.className = `ws-msg ${type}`;
    div.textContent = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  };

  connectBtn?.addEventListener('click', () => {
    if (!connected) {
      connected = true;
      badge?.classList.add('online');
      if (badge) badge.textContent = '已連線';
      if (connectBtn) connectBtn.textContent = '斷線';
      appendMsg('✅ WebSocket 連線建立（本地模擬）', 'ws-system');
      // Simulate periodic server push
      echoTimer = setInterval(() => {
        const msgs = ['Server ping ✓', '心跳包 ♥', '系統正常 ✓', '資料同步中...'];
        appendMsg(msgs[Math.floor(Math.random() * msgs.length)], 'ws-recv');
      }, 4000);
    } else {
      connected = false;
      clearInterval(echoTimer);
      badge?.classList.remove('online');
      if (badge) badge.textContent = '離線';
      if (connectBtn) connectBtn.textContent = '連線';
      appendMsg('❌ 連線已斷開', 'ws-system');
    }
  });

  const send = () => {
    const text = input?.value.trim();
    if (!text || !connected) return;
    appendMsg(text, 'ws-sent');
    if (input) input.value = '';
    // Simulate echo after delay
    setTimeout(() => appendMsg(`Echo: ${text}`, 'ws-recv'), 300 + Math.random() * 400);
  };

  sendBtn?.addEventListener('click', send);
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
}

/* ════════════════════════════════════════════════════════════
   10. A-FRAME VR/AR
   ════════════════════════════════════════════════════════════ */
function initAFrame() {
  const toggleBtn   = document.getElementById('aframe-toggle');
  const container   = document.getElementById('aframe-container');
  let loaded = false;

  toggleBtn?.addEventListener('click', async () => {
    if (loaded) return;
    loaded = true;
    toggleBtn.textContent = '載入中...';
    toggleBtn.disabled = true;

    try {
      await loadScript('https://aframe.io/releases/1.5.0/aframe.min.js', 'aframe');

      container.innerHTML = `
        <a-scene embedded style="width:100%;height:450px;" vr-mode-ui="enabled:true">
          <a-sky color="#04080c"></a-sky>
          <a-entity position="0 0 0">
            <!-- DNA Spheres -->
            <a-sphere position="-2 1.5 -5" radius="0.6" color="#58d7ff"
              animation="property:rotation;to:0 360 0;loop:true;dur:4000;easing:linear"
              shadow></a-sphere>
            <a-sphere position="2 1.5 -5" radius="0.6" color="#b59cff"
              animation="property:rotation;to:0 -360 0;loop:true;dur:3000;easing:linear"
              shadow></a-sphere>
            <a-sphere position="0 2.5 -5" radius="0.4" color="#7bf0be"
              animation="property:position;to:0 3.5 -5;loop:true;dir:alternate;dur:2000"
              shadow></a-sphere>
            <!-- Box -->
            <a-box position="-2 0.5 -4" rotation="0 45 0" width="1" height="1" depth="1" color="#ffd080"
              animation="property:rotation;from:0 45 0;to:0 405 0;loop:true;dur:3000;easing:linear"
              shadow></a-box>
            <!-- Torus -->
            <a-torus position="2 0.8 -4" color="#ff8080" radius="0.5" radius-tubular="0.1"
              animation="property:rotation;to:360 360 0;loop:true;dur:5000;easing:linear"
              shadow></a-torus>
            <!-- Ground -->
            <a-plane position="0 0 -4" rotation="-90 0 0" width="10" height="10" color="#0a1520"></a-plane>
            <!-- Text -->
            <a-text value="WebXR · A-Frame VR" position="0 3.5 -5" align="center" color="#58d7ff" width="6"></a-text>
          </a-entity>
          <!-- Camera -->
          <a-entity camera look-controls wasd-controls position="0 1.6 0"></a-entity>
          <!-- Lights -->
          <a-light type="ambient" color="#ffffff" intensity="0.4"></a-light>
          <a-light type="directional" color="#58d7ff" intensity="0.8" position="2 4 -3"></a-light>
        </a-scene>
      `;
      toggleBtn.textContent = '已載入 · 拖拉旋轉';
    } catch {
      container.innerHTML = '<div class="aframe-placeholder"><p>A-Frame 載入失敗，請確認網路連線</p></div>';
      toggleBtn.textContent = '載入失敗';
    }
  });
}

/* ════════════════════════════════════════════════════════════
   11. WEBASSEMBLY — Fibonacci + Image Processing
   ════════════════════════════════════════════════════════════ */
function initWebAssembly() {
  const runJS   = document.getElementById('wasm-run-js');
  const runWasm = document.getElementById('wasm-run-wasm');

  // JS fibonacci (reference)
  function fibJS(n) {
    if (n <= 1) return n;
    return fibJS(n - 1) + fibJS(n - 2);
  }

  const N = 40;
  let jsTime = null;

  runJS?.addEventListener('click', () => {
    const t0 = performance.now();
    const result = fibJS(N);
    const t1 = performance.now();
    jsTime = t1 - t0;

    document.getElementById('js-time').textContent = `${jsTime.toFixed(1)} ms`;
    document.getElementById('js-val').textContent   = `fib(${N}) = ${result}`;
    document.getElementById('js-bar').style.width   = '100%';
    updateSpeedup();
  });

  // WebAssembly — inline WAT compiled to binary
  const wasmBinary = buildFibWasm();

  runWasm?.addEventListener('click', async () => {
    try {
      const module = await WebAssembly.compile(wasmBinary);
      const instance = await WebAssembly.instantiate(module);
      const t0 = performance.now();
      const result = instance.exports.fib(N);
      const t1 = performance.now();
      const wasmT = t1 - t0;

      document.getElementById('wasm-time').textContent = `${wasmT.toFixed(1)} ms`;
      document.getElementById('wasm-val').textContent   = `fib(${N}) = ${result}`;
      if (jsTime) {
        const ratio = Math.min(wasmT / jsTime, 1);
        document.getElementById('wasm-bar').style.width = `${(ratio * 100).toFixed(1)}%`;
      } else {
        document.getElementById('wasm-bar').style.width = '60%';
      }
      updateSpeedup(wasmT);
    } catch(e) {
      document.getElementById('wasm-time').textContent = 'WASM 錯誤';
      console.error('WASM:', e);
    }
  });

  function updateSpeedup(wasmT) {
    const note = document.getElementById('wasm-speedup');
    if (!note) return;
    if (jsTime && wasmT) {
      const speedup = (jsTime / wasmT).toFixed(2);
      note.textContent = speedup > 1
        ? `⚡ WebAssembly 比 JavaScript 快 ${speedup}×`
        : `JS 比 WASM 快 ${(wasmT/jsTime).toFixed(2)}× （此計算 JIT 已足夠）`;
    }
  }

  // Image filter (Canvas pixel manipulation — simulates WASM-style processing)
  initWasmImageFilter();
}

// Build a minimal WASM binary for recursive Fibonacci
function buildFibWasm() {
  // (module (func $fib (export "fib") (param i32) (result i32)
  //   (if (i32.le_s (local.get 0) (i32.const 1)) (then (return (local.get 0))))
  //   (i32.add (call $fib (i32.sub (local.get 0) (i32.const 1)))
  //            (call $fib (i32.sub (local.get 0) (i32.const 2))))))
  const bytes = new Uint8Array([
    0x00,0x61,0x73,0x6d, // magic
    0x01,0x00,0x00,0x00, // version
    // Type section: func (i32) -> i32
    0x01,0x06,0x01,0x60,0x01,0x7f,0x01,0x7f,
    // Function section
    0x03,0x02,0x01,0x00,
    // Export section: "fib" = func 0
    0x07,0x07,0x01,0x03,0x66,0x69,0x62,0x00,0x00,
    // Code section
    0x0a,0x1f,0x01,0x1d,0x00,
    // if (n <= 1) return n
    0x20,0x00,           // local.get 0
    0x41,0x01,           // i32.const 1
    0x4c,                // i32.le_s
    0x04,0x40,           // if (void)
    0x20,0x00,           // local.get 0
    0x0f,                // return
    0x0b,                // end if
    // fib(n-1) + fib(n-2)
    0x20,0x00,           // local.get 0
    0x41,0x01,           // i32.const 1
    0x6b,                // i32.sub
    0x10,0x00,           // call $fib
    0x20,0x00,           // local.get 0
    0x41,0x02,           // i32.const 2
    0x6b,                // i32.sub
    0x10,0x00,           // call $fib
    0x6a,                // i32.add
    0x0b,                // end func
  ]);
  return bytes.buffer;
}

function initWasmImageFilter() {
  const upload = document.getElementById('wasm-img-upload');
  const origCanvas = document.getElementById('wasm-original-canvas');
  const outCanvas  = document.getElementById('wasm-output-canvas');
  let origImageData = null;
  let activeFilter = 'none';

  upload?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const W = 280, H = 160;
      origCanvas.width = W; origCanvas.height = H;
      outCanvas.width  = W; outCanvas.height  = H;
      const ctx = origCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      origImageData = ctx.getImageData(0, 0, W, H);
      applyFilter(activeFilter);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      activeFilter = this.dataset.filter;
      applyFilter(activeFilter);
    });
  });

  function applyFilter(filter) {
    if (!origImageData || !outCanvas) return;
    const ctx = outCanvas.getContext('2d');
    const src = origImageData;
    const out = ctx.createImageData(src.width, src.height);
    const d = src.data, o = out.data;

    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i+1], b = d[i+2];
      switch (filter) {
        case 'grayscale': { const v = 0.299*r + 0.587*g + 0.114*b; r=g=b=v; break; }
        case 'sepia':
          r = Math.min(255, r*0.393 + g*0.769 + b*0.189);
          g = Math.min(255, d[i]*0.349 + d[i+1]*0.686 + b*0.168);
          b = Math.min(255, d[i]*0.272 + d[i+1]*0.534 + d[i+2]*0.131);
          break;
        case 'invert': r=255-r; g=255-g; b=255-b; break;
        case 'blur': {
          // Box blur: average 3×3 neighbourhood
          const W = src.width;
          const x = (i/4) % W, y = Math.floor((i/4) / W);
          let sr=0,sg=0,sb=0,cnt=0;
          for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) {
            const nx=x+dx, ny=y+dy;
            if (nx<0||nx>=W||ny<0||ny>=src.height) continue;
            const ni=(ny*W+nx)*4;
            sr+=d[ni]; sg+=d[ni+1]; sb+=d[ni+2]; cnt++;
          }
          r=sr/cnt; g=sg/cnt; b=sb/cnt; break;
        }
      }
      o[i]=r; o[i+1]=g; o[i+2]=b; o[i+3]=d[i+3];
    }
    ctx.putImageData(out, 0, 0);
  }
}

/* ════════════════════════════════════════════════════════════
   12. PWA — Service Worker + Install Prompt
   ════════════════════════════════════════════════════════════ */
function initPWA() {
  let deferredPrompt = null;

  // Service worker status
  const swStatus = document.getElementById('sw-status');
  const swDetail = document.getElementById('sw-detail');
  const cacheStatus = document.getElementById('cache-status');
  const installStatus = document.getElementById('install-status');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      if (swStatus) { swStatus.textContent = '✅ 已啟動'; swStatus.className = 'pwa-status ok'; }
      if (swDetail) swDetail.textContent = `Scope: ${reg.scope}`;
    }).catch(err => {
      if (swStatus) { swStatus.textContent = '⚠ 未啟動'; swStatus.className = 'pwa-status warn'; }
      if (swDetail) swDetail.textContent = `${err.message}`;
    });
  } else {
    if (swStatus) swStatus.textContent = '❌ 不支援';
  }

  // Cache status
  if ('caches' in window) {
    if (cacheStatus) { cacheStatus.textContent = '✅ API 可用'; cacheStatus.className = 'pwa-status ok'; }
  } else {
    if (cacheStatus) cacheStatus.textContent = '❌ 不支援';
  }

  document.getElementById('cache-test-btn')?.addEventListener('click', async () => {
    try {
      const keys = await caches.keys();
      if (cacheStatus) {
        cacheStatus.textContent = keys.length ? `✅ ${keys.length} 個快取` : '⚠ 無快取';
        cacheStatus.className = `pwa-status ${keys.length ? 'ok' : 'warn'}`;
      }
    } catch { if (cacheStatus) cacheStatus.textContent = '無法存取快取'; }
  });

  // Install prompt
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    const bar = document.getElementById('pwa-install-bar');
    bar?.classList.remove('hidden');
    if (installStatus) { installStatus.textContent = '✅ 可安裝'; installStatus.className = 'pwa-status ok'; }
  });

  const installHandler = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (installStatus) installStatus.textContent = outcome === 'accepted' ? '✅ 已安裝' : '⚠ 已取消';
  };

  document.getElementById('pwa-install-btn')?.addEventListener('click', installHandler);
  document.getElementById('pwa-install-btn-2')?.addEventListener('click', installHandler);
  document.getElementById('pwa-dismiss-btn')?.addEventListener('click', () => {
    document.getElementById('pwa-install-bar')?.classList.add('hidden');
  });

  window.addEventListener('appinstalled', () => {
    if (installStatus) { installStatus.textContent = '✅ 已安裝'; installStatus.className = 'pwa-status ok'; }
    document.getElementById('pwa-install-bar')?.classList.add('hidden');
  });

  // Notification
  const notifStatus = document.getElementById('notif-status');
  const notifBtn = document.getElementById('notif-request-btn');

  if ('Notification' in window) {
    if (notifStatus) notifStatus.textContent = Notification.permission;
  }

  notifBtn?.addEventListener('click', async () => {
    if (!('Notification' in window)) { if (notifStatus) notifStatus.textContent = '不支援'; return; }
    const perm = await Notification.requestPermission();
    if (notifStatus) { notifStatus.textContent = perm; notifStatus.className = `pwa-status ${perm === 'granted' ? 'ok' : 'warn'}`; }
    if (perm === 'granted') {
      new Notification('互動技術展示館', {
        body: '推播通知已啟用 🎉',
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>",
      });
    }
  });

  // PWA Checklist
  const list = document.getElementById('pwa-checklist');
  if (list) {
    const checks = [
      { label: 'HTTPS / localhost', pass: location.protocol === 'https:' || location.hostname === 'localhost' },
      { label: 'Web App Manifest', pass: !!document.querySelector('link[rel="manifest"]') },
      { label: 'Service Worker API', pass: 'serviceWorker' in navigator },
      { label: 'Cache Storage API', pass: 'caches' in window },
      { label: 'Notification API',  pass: 'Notification' in window },
      { label: 'Push API', pass: 'PushManager' in window },
      { label: 'IndexedDB', pass: 'indexedDB' in window },
      { label: 'Background Sync',  pass: 'SyncManager' in window },
    ];
    list.innerHTML = checks.map(c => `
      <li class="${c.pass ? 'pass' : 'fail'}">
        <span>${c.pass ? '✅' : '❌'}</span>
        <span>${c.label}</span>
      </li>
    `).join('');
  }
}

/* ════════════════════════════════════════════════════════════
   Accessibility — prefers-reduced-motion
   ════════════════════════════════════════════════════════════ */
function initAccessibility() {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const label  = document.getElementById('motion-label');
  const detail = document.getElementById('motion-detail');

  const updateMotion = (reduced) => {
    if (label)  label.textContent  = reduced ? '系統設定：減少動態效果' : '系統設定：允許動態效果';
    if (detail) detail.textContent = reduced
      ? '已自動關閉高強度動畫，以保護前庭障礙使用者。'
      : '動畫已正常啟用。可在系統偏好設定中調整。';
  };

  updateMotion(mq.matches);
  mq.addEventListener('change', e => updateMotion(e.matches));

  document.getElementById('force-reduce-motion')?.addEventListener('change', function() {
    document.body.classList.toggle('reduce-motion', this.checked);
  });
}

/* ════════════════════════════════════════════════════════════
   CSS Demos — Morph Button (already handled in micro)
   Tech Nav — active highlight on scroll
   ════════════════════════════════════════════════════════════ */
function initTechNav() {
  const pills = document.querySelectorAll('.tech-pill');
  const sections = [...document.querySelectorAll('.showcase-section, .showcase-hero, .parallax-section')];

  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const id = e.target.id;
      pills.forEach(p => {
        p.classList.toggle('active', p.getAttribute('href') === `#${id}`);
      });
    });
  }, { threshold: 0.3 });

  sections.forEach(s => obs.observe(s));
}

/* ════════════════════════════════════════════════════════════
   BOOT
   ════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initThreeHero();
  initWebAnimationsAPI();
  initCanvas2D();
  initScrollTimeline();
  initParallax();
  initMicroInteractions();
  initIntersectionObserver();
  initSpeechAPI();
  initRealtime();
  initAFrame();
  initWebAssembly();
  initPWA();
  initAccessibility();
  initTechNav();
});
