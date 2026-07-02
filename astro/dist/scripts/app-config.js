(() => {
    const existingConfig = window.APP_CONFIG || {};

    const normalizeUrl = (value) => String(value || '').trim().replace(/\/+$/, '');
    const normalizeList = (values) => Array.isArray(values)
        ? values.map(normalizeUrl).filter(Boolean)
        : [];

    const rawInjectedApiBase = '__API_BASE_URL__';
    const injectedApiBase = rawInjectedApiBase === '__API_BASE_URL__'
        ? ''
        : normalizeUrl(rawInjectedApiBase);
    const configuredApiBase = typeof existingConfig.API_BASE_URL === 'string'
        ? normalizeUrl(existingConfig.API_BASE_URL)
        : '';
    const host = window.location.hostname;
    const defaultPortfolioServiceNames = ['donttalk'];
    const defaultApiServiceNames = ['donttalk-api'];
    // Canonical backend (Railway). fly.dev / netlify-app variants are kept as
    // graceful fallbacks if they ever come back online, but probing them costs
    // a DNS lookup + timeout per candidate, so we short-circuit on the first
    // resolvable host via the resolveApiBase loop below.
    const defaultApiCandidates = [
        'https://donttalk-api-production.up.railway.app',
    ];

    // ── Stale-cache scrub ────────────────────────────────────────────────────
    // Older versions of this file (and the v1 service-worker-served pages)
    // stored `fly.dev` candidates in `window.APP_CONFIG.API_CANDIDATES` and
    // / or in the SW HTTP cache. When a stale HTML payload set
    // `window.APP_CONFIG.API_CANDIDATES` from a previous session, this run
    // would inherit those dead hosts and the resolve loop would burn timeouts
    // on every page. Bumping APP_CONFIG_VERSION forces a one-time reset.
    const APP_CONFIG_VERSION = 3;
    const STORAGE_VERSION_KEY = '_app_config_version';
    const STORAGE_API_BASE_KEY = '_app_config_api_base';
    try {
        const storedVersion = parseInt(localStorage.getItem(STORAGE_VERSION_KEY) || '0', 10);
        if (storedVersion < APP_CONFIG_VERSION) {
            localStorage.setItem(STORAGE_VERSION_KEY, String(APP_CONFIG_VERSION));
            localStorage.removeItem(STORAGE_API_BASE_KEY);
            // Force re-derivation from defaults even if a previous run cached
            // candidates on `window.APP_CONFIG`.
            if (window.APP_CONFIG) {
                delete window.APP_CONFIG.API_CANDIDATES;
                delete window.APP_CONFIG.API_BASE_URL;
                delete window.APP_CONFIG.DEFAULT_API_BASE_URL;
            }
        }
    } catch {
        /* localStorage may be disabled — fall through to defaults. */
    }

    // Drop any dead hosts that older runs may have pushed into APP_CONFIG.
    const DEAD_HOST_PATTERNS = ['fly.dev', 'onrender.com', 'herokuapp.com'];
    const liveApiCandidatesFromExisting = normalizeList(existingConfig.API_CANDIDATES)
        .filter(c => !DEAD_HOST_PATTERNS.some(dead => c.includes(dead)));

    const resolvedPortfolioServiceNames = normalizeList(existingConfig.PORTFOLIO_SERVICE_NAMES).length
        ? normalizeList(existingConfig.PORTFOLIO_SERVICE_NAMES)
        : defaultPortfolioServiceNames;
    const resolvedApiServiceNames = normalizeList(existingConfig.API_SERVICE_NAMES).length
        ? normalizeList(existingConfig.API_SERVICE_NAMES)
        : defaultApiServiceNames;
    const resolvedApiCandidates = liveApiCandidatesFromExisting.length
        ? liveApiCandidatesFromExisting
        : defaultApiCandidates;
    const fallbackApiBase = ['localhost', '127.0.0.1'].includes(host)
        ? `http://${host}:8000`
        : (resolvedApiCandidates[resolvedApiCandidates.length - 1] || '');
    const resolutionCache = new Map();

    const pushCandidate = (candidates, value) => {
        const normalized = normalizeUrl(value);
        if (normalized && !candidates.includes(normalized)) {
            candidates.push(normalized);
        }
    };

    const deriveApiCandidates = (options = {}) => {
        const candidates = [];
        pushCandidate(candidates, configuredApiBase);
        pushCandidate(candidates, injectedApiBase);
        pushCandidate(candidates, existingConfig.DEFAULT_API_BASE_URL);

        if (options.includeCurrentOrigin !== false) {
            const currentOrigin = normalizeUrl(window.location.origin);
            pushCandidate(candidates, currentOrigin);
            for (const portfolioServiceName of resolvedPortfolioServiceNames) {
                if (!currentOrigin.includes(portfolioServiceName)) {
                    continue;
                }

                for (const apiServiceName of resolvedApiServiceNames) {
                    pushCandidate(candidates, currentOrigin.replace(portfolioServiceName, apiServiceName));
                }
            }
        }

        resolvedApiCandidates.forEach((candidate) => pushCandidate(candidates, candidate));
        return candidates;
    };

    const resolveApiBase = async (options = {}) => {
        const cacheKey = options.cacheKey || 'default';
        if (!options.refresh && resolutionCache.has(cacheKey)) {
            return resolutionCache.get(cacheKey);
        }

        const candidates = deriveApiCandidates(options);
        for (const candidate of candidates) {
            try {
                const response = await fetch(`${candidate}/healthz`, {
                    signal: AbortSignal.timeout(3000),
                });
                if (!response.ok) {
                    continue;
                }

                const data = await response.json().catch(() => null);
                if (data?.status === 'ok') {
                    resolutionCache.set(cacheKey, candidate);
                    return candidate;
                }
            } catch (error) {
                continue;
            }
        }

        resolutionCache.set(cacheKey, '');
        return '';
    };

    /**
     * Returns the sync secret for protected /sync endpoints.
     * Resolution order:
     *   1. window.APP_CONFIG.SYNC_SECRET (injected at build/deploy time)
     *   2. ?sync_token=<value> URL param  →  also saves to localStorage for future calls
     *   3. localStorage item '_sync_secret'
     */
    const getSyncSecret = () => {
        if (existingConfig.SYNC_SECRET) return String(existingConfig.SYNC_SECRET);
        try {
            const urlParam = new URLSearchParams(window.location.search).get('sync_token');
            if (urlParam) {
                localStorage.setItem('_sync_secret', urlParam);
                return urlParam;
            }
            return localStorage.getItem('_sync_secret') || '';
        } catch {
            return '';
        }
    };

    window.APP_CONFIG = {
        ...existingConfig,
        API_BASE_URL: configuredApiBase || injectedApiBase || fallbackApiBase,
        DEFAULT_API_BASE_URL: injectedApiBase || fallbackApiBase,
        PORTFOLIO_SERVICE_NAMES: resolvedPortfolioServiceNames,
        API_SERVICE_NAMES: resolvedApiServiceNames,
        API_CANDIDATES: resolvedApiCandidates
    };
    window.APP_CONFIG_UTILS = {
        deriveApiCandidates,
        normalizeUrl,
        resolveApiBase,
        getSyncSecret,
    };
})();