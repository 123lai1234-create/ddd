// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
    build: {
        format: 'file',
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
