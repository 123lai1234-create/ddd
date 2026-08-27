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
    const defaultApiCandidates = ['https://donttalk-api.fly.dev', 'https://donttalk.vercel.app'];
    const resolvedPortfolioServiceNames = normalizeList(existingConfig.PORTFOLIO_SERVICE_NAMES).length
        ? normalizeList(existingConfig.PORTFOLIO_SERVICE_NAMES)
        : defaultPortfolioServiceNames;
    const resolvedApiServiceNames = normalizeList(existingConfig.API_SERVICE_NAMES).length
        ? normalizeList(existingConfig.API_SERVICE_NAMES)
        : defaultApiServiceNames;
    const resolvedApiCandidates = normalizeList(existingConfig.API_CANDIDATES).length
        ? normalizeList(existingConfig.API_CANDIDATES)
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
        // The deployed API lives under /api/* (Vercel edge function); probe
        // /api/healthz first, then fall back to the classic root /healthz.
        const probePaths = ['/api/healthz', '/healthz'];
        for (const candidate of candidates) {
            for (const probePath of probePaths) {
                try {
                    const response = await fetch(`${candidate}${probePath}`);
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