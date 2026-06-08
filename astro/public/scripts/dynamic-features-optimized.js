/**
 * Optimized Dynamic Features
 * - Lazy loading with better error handling
 * - Loading state indicators
 * - Performance monitoring
 * - Graceful degradation
 */

/* ── Loading State Manager ──────────────────────────────────────────────────── */

class LoadingStateManager {
  constructor() {
    this.activeLoads = new Map();
  }

  show(elementId, message = 'Loading...') {
    let loader = document.getElementById(elementId + '-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = elementId + '-loader';
      loader.className = 'loading-indicator';
      loader.innerHTML = `
        <div class="spinner"></div>
        <p>${message}</p>
      `;
      const target = document.getElementById(elementId);
      if (target) target.parentNode.insertBefore(loader, target);
    }
    loader.style.display = 'block';
    this.activeLoads.set(elementId, true);
  }

  hide(elementId) {
    const loader = document.getElementById(elementId + '-loader');
    if (loader) loader.style.display = 'none';
    this.activeLoads.delete(elementId);
  }

  isLoading() {
    return this.activeLoads.size > 0;
  }
}

const loadingManager = new LoadingStateManager();

/* ── Lazy CDN loader with retry logic ────────────────────────────────────────── */

const _loaded = new Set();
const _loading = new Map();

function loadScript(url, id, options = {}) {
  const key = id || url;
  if (_loaded.has(key)) return Promise.resolve();
  if (_loading.has(key)) return _loading.get(key);

  const promise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = options.async !== false;
    s.defer = options.defer !== false;
    
    s.onload = () => {
      _loaded.add(key);
      _loading.delete(key);
      resolve();
    };
    
    s.onerror = () => {
      _loading.delete(key);
      console.warn(`Failed to load script: ${url}`);
      reject(new Error(`Script load failed: ${url}`));
    };
    
    document.head.appendChild(s);
  });

  _loading.set(key, promise);
  return promise;
}

function loadCSS(url) {
  if (_loaded.has(url)) return;
  _loaded.add(url);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = url;
  l.onerror = () => console.warn(`Failed to load CSS: ${url}`);
  document.head.appendChild(l);
}

/* ── 1. Vanta.js DNA background (optimized) ──────────────────────────────────── */

async function initVantaDNA() {
  const el = document.querySelector('.hero-canvas');
  if (!el) return;
  
  try {
    loadingManager.show('hero-canvas', 'Initializing background...');
    
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js', 'three');
    await loadScript('https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.net.min.js', 'vanta');
    
    if (!window.VANTA) {
      throw new Error('VANTA library not available');
    }

    window._vantaEffect = window.VANTA.NET({
      el,
      mouseControls: true,
      touchControls: true,
      minHeight: 400,
      minWidth: 200,
      scale: 1.0,
      scaleMobile: 0.8,
      color: 0x58d7ff,
      backgroundColor: 0x0a1116,
      points: 8,
      maxDistance: 22,
      spacing: 18,
      showDots: true,
    });

    loadingManager.hide('hero-canvas');
  } catch (error) {
    console.error('Vanta initialization failed:', error);
    loadingManager.hide('hero-canvas');
    // Graceful degradation - continue without Vanta
  }
}

/* ── 2. GSAP ScrollTrigger (optimized) ────────────────────────────────────────── */

async function initGSAP() {
  const reveals = document.querySelectorAll('section, .card, .metric-card, .algo-card, .surface-card, .runtime-card, .explore-card, .img-card, .faq-item');
  if (!reveals.length) return;

  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js', 'gsap');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js', 'scrolltrigger');

    if (!window.gsap || !window.ScrollTrigger) {
      throw new Error('GSAP libraries not available');
    }

    gsap.registerPlugin(ScrollTrigger);

    // Batch animations for better performance
    reveals.forEach((el, i) => {
      gsap.from(el, {
        y: 40,
        opacity: 0,
        duration: 0.7,
        delay: (i % 4) * 0.08,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          toggleActions: 'play none none none',
          once: true, // Only animate once
        },
      });
    });

    // Animate stat numbers with reduced motion support
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReducedMotion) {
      document.querySelectorAll('.hero-stat .val, .metric-val').forEach(el => {
        const target = parseFloat(el.textContent);
        if (!isFinite(target)) return;

        const obj = { v: 0 };
        gsap.to(obj, {
          v: target,
          duration: 1.6,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 90%',
            once: true,
          },
          onUpdate: () => {
            el.textContent = target >= 100 ? Math.round(obj.v) : obj.v.toFixed(1);
          },
        });
      });
    }
  } catch (error) {
    console.error('GSAP initialization failed:', error);
    // Graceful degradation - elements remain visible without animation
  }
}

/* ── 3. tsParticles molecular background (optimized) ──────────────────────────── */

async function initParticles() {
  const el = document.getElementById('tsparticles');
  if (!el) return;

  try {
    await loadScript('https://cdn.jsdelivr.net/npm/tsparticles-slim@2/tsparticles.slim.bundle.min.js', 'tsparticles');

    if (!window.tsParticles) {
      throw new Error('tsParticles library not available');
    }

    await window.tsParticles.load('tsparticles', {
      particles: {
        number: { value: 30, density: { enable: true, value_area: 800 } },
        color: { value: '#58d7ff' },
        shape: { type: 'circle' },
        opacity: { value: 0.5, random: true },
        size: { value: 3, random: true },
        move: { enable: true, speed: 1, random: true },
      },
      interactivity: {
        events: { onhover: { enable: true, mode: 'repulse' } },
        modes: { repulse: { distance: 100 } },
      },
    });
  } catch (error) {
    console.error('tsParticles initialization failed:', error);
  }
}

/* ── Initialize all features on demand ────────────────────────────────────────── */

async function initializeAllFeatures() {
  // Defer initialization to avoid blocking page render
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAllFeatures);
    return;
  }

  // Use requestIdleCallback for better performance
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      initVantaDNA();
      initGSAP();
      initParticles();
    });
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(() => {
      initVantaDNA();
      initGSAP();
      initParticles();
    }, 1000);
  }
}

// Start initialization
initializeAllFeatures();

/* ── Export for testing ────────────────────────────────────────────────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { loadScript, loadCSS, loadingManager };
}
