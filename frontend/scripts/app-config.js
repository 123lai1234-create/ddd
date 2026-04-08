(() => {
    const existingConfig = window.APP_CONFIG || {};
    const configuredApiBase = typeof existingConfig.API_BASE_URL === 'string'
        ? existingConfig.API_BASE_URL.trim().replace(/\/+$/, '')
        : '';
    const host = window.location.hostname;
    const fallbackApiBase = ['localhost', '127.0.0.1'].includes(host)
        ? `http://${host}:8080`
        : 'https://donttalk-api-production.up.railway.app';

    window.APP_CONFIG = {
        ...existingConfig,
        API_BASE_URL: configuredApiBase || fallbackApiBase
    };
})();