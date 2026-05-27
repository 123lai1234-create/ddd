/**
 * Code Splitting & Lazy Loading Module
 * Dynamic import for non-critical JavaScript
 */

// ─── Lazy Load Modules Map ───
const LAZY_MODULES = {
    'plotly': () => import('./plotly-loader.js'),
    'three': () => import('./three-loader.js'),
    'particles': () => import('./particles-loader.js'),
    'charts': () => import('./charts-loader.js'),
};

// ─── Preload Hints for Critical Routes ───
const PRELOAD_MODULES = [
    'plotly',
    'three',
    'particles',
];

/**
 * Preload critical modules after initial render
 */
export function preloadCriticalModules() {
    // Use requestIdleCallback for non-blocking preload
    const schedule = window.requestIdleCallback || setTimeout;

    schedule(() => {
        PRELOAD_MODULES.forEach(name => {
            if (LAZY_MODULES[name]) {
                LAZY_MODULES[name](); // Fire and forget
            }
        });
    }, { timeout: 2000 });
}

/**
 * Lazy load a module by name
 * @param {string} moduleName - Module identifier
 * @returns {Promise<any>} - Loaded module
 */
export async function lazyLoad(moduleName) {
    if (LAZY_MODULES[moduleName]) {
        const loader = LAZY_MODULES[moduleName];
        return await loader();
    }
    console.warn(`Unknown lazy module: ${moduleName}`);
    return null;
}

/**
 * Intersection Observer for lazy loading components
 * @param {string} selector - CSS selector for elements to observe
 * @param {Function} onVisible - Callback when element becomes visible
 */
export function createLazyLoader(selector, onVisible) {
    if (!('IntersectionObserver' in window)) {
        // Fallback: load immediately
        document.querySelectorAll(selector).forEach(onVisible);
        return;
    }

    const observer = new IntersectionObserver(
        (entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    onVisible(entry.target);
                    obs.unobserve(entry.target);
                }
            });
        },
        {
            rootMargin: '100px 0px', // Start loading 100px before viewport
            threshold: 0.01
        }
    );

    document.querySelectorAll(selector).forEach(el => observer.observe(el));

    return observer;
}

// ─── Dynamic Script Loader ───
/**
 * Load external script dynamically
 * @param {string} src - Script URL
 * @param {string} type - Script type (module, text/javascript)
 * @returns {Promise<void>}
 */
export function loadScript(src, type = 'text/javascript') {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.type = type;
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// ─── Deferred Loading for Heavy Libraries ───
const HEAVY_LIBRARIES = {
    'plotly': {
        src: 'https://cdn.plot.ly/plotly-2.27.0.min.js',
        condition: () => document.getElementById('plotly-chart')
    },
    'd3': {
        src: 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js',
        condition: () => document.querySelector('.d3-chart')
    }
};

/**
 * Load heavy libraries only when needed
 */
export async function loadHeavyLibraries() {
    const schedule = window.requestIdleCallback || setTimeout;

    schedule(() => {
        Object.entries(HEAVY_LIBRARIES).forEach(([name, config]) => {
            if (config.condition()) {
                loadScript(config.src).catch(console.error);
            }
        });
    }, { timeout: 3000 });
}

// ─── Route-Based Code Splitting ───
/**
 * Get page-specific modules based on current page
 * @returns {string[]} - List of module names to preload
 */
export function getPageModules() {
    const page = document.body.dataset.page || 'index';

    const pageModules = {
        'index': ['particles'],
        'ngs': ['plotly', 'charts'],
        'report': ['plotly', 'charts'],
        'gene_ai': ['three'],
        'protein_mpnn': ['three'],
        'about_me': ['charts']
    };

    return pageModules[page] || [];
}

/**
 * Initialize page-specific lazy loading
 */
export async function initPageLazyLoading() {
    const modules = getPageModules();

    // Use requestIdleCallback for non-blocking load
    const schedule = window.requestIdleCallback || setTimeout;

    schedule(async () => {
        await Promise.allSettled(
            modules.map(name => lazyLoad(name))
        );
    }, { timeout: 1000 });
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        preloadCriticalModules();
        loadHeavyLibraries();
    });
} else {
    preloadCriticalModules();
    loadHeavyLibraries();
}
