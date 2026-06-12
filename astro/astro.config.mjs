// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
    output: 'static',
    adapter: vercel({
        webAnalytics: { enabled: false },
        imageService: false,
    }),
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
