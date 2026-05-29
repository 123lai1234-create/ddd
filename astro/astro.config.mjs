// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
    build: {
        format: 'file',
    },
    compressHTML: true,
    build: {
        format: 'file',
        assets: 'assets/[name].[hash][ext]',
    },
    vite: {
        build: {
            minify: 'esbuild',
            cssMinify: true,
        },
    },
});
