// @ts-check
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';

export default defineConfig({
    output: 'hybrid',
    adapter: vercel(),
    build: {
        format: 'directory',
        assets: '_assets',
    },
    compressHTML: true,
    server: {
        compressHTML: true,
    },
    vite: {
        build: {
            minify: 'esbuild',
            cssMinify: true,
            rollupOptions: {
                output: {
                    manualChunks: {
                        'astro-core': ['astro'],
                    },
                },
            },
        },
        optimizeDeps: {
            include: ['astro'],
        },
        css: {
            minify: 'esbuild',
        },
    },
    prefetch: {
        prefetchAll: true,
        defaultStrategy: 'viewport',
    },
});
