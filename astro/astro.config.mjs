// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
    build: {
        format: 'file',
        assets: 'assets/[name].[hash][ext]',
    },
    compressHTML: true,
    vite: {
        build: {
            minify: 'esbuild',
            cssMinify: true,
        },
    },
});
