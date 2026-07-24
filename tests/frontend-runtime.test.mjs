import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const APP_CONFIG_PATH = new URL('../astro/public/scripts/app-config.js', import.meta.url);
const INDEX_PATH = new URL('../astro/src/pages/index.astro', import.meta.url);

function loadAppConfig({
  hostname = 'donttalk.vercel.app',
  origin = 'https://donttalk.vercel.app',
  existingConfig = {},
  storedVersion = '4',
} = {}) {
  const source = fs.readFileSync(APP_CONFIG_PATH, 'utf8');
  const fetchCalls = [];
  const storage = new Map([['_app_config_version', storedVersion]]);
  const window = {
    APP_CONFIG: { ...existingConfig },
    location: { hostname, origin, search: '' },
  };
  const context = {
    AbortSignal: { timeout: () => undefined },
    URLSearchParams,
    fetch: async (url) => {
      fetchCalls.push(String(url));
      return {
        ok: true,
        json: async () => ({ status: 'ok' }),
      };
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
      setItem: (key, value) => storage.set(key, String(value)),
    },
    window,
  };

  vm.runInNewContext(source, context, { filename: APP_CONFIG_PATH.pathname });
  return { fetchCalls, window };
}

test('production disables portfolio API discovery when no backend is configured', async () => {
  const { fetchCalls, window } = loadAppConfig();

  assert.deepEqual(Array.from(window.APP_CONFIG_UTILS.deriveApiCandidates()), []);
  assert.equal(await window.APP_CONFIG_UTILS.resolveApiBase(), '');
  assert.deepEqual(fetchCalls, []);
});

test('production ignores stale offline backend candidates', async () => {
  const { fetchCalls, window } = loadAppConfig({
    existingConfig: {
      API_BASE_URL: 'https://donttalk-api.vercel.app',
      DEFAULT_API_BASE_URL: 'https://donttalk-api-production.up.railway.app',
      API_CANDIDATES: [
        'https://donttalk-api.vercel.app',
        'https://donttalk-api-production.up.railway.app',
      ],
    },
  });

  assert.deepEqual(Array.from(window.APP_CONFIG_UTILS.deriveApiCandidates()), []);
  assert.equal(await window.APP_CONFIG_UTILS.resolveApiBase(), '');
  assert.deepEqual(fetchCalls, []);
});

test('local development still discovers the local API', () => {
  const { window } = loadAppConfig({
    hostname: 'localhost',
    origin: 'http://localhost:4321',
  });

  assert.deepEqual(
    Array.from(window.APP_CONFIG_UTILS.deriveApiCandidates()),
    ['http://localhost:4321', 'http://localhost:8000'],
  );
});

test('homepage does not call the anonymous GitHub REST API from browsers', () => {
  const source = fs.readFileSync(INDEX_PATH, 'utf8');

  assert.doesNotMatch(source, /api\.github\.com/);
});
