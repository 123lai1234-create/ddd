// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
    site: 'https://donttalk.vercel.app',
    integrations: [react()],
    build: {
        format: 'directory',
    },
    vite: {
        optimizeDeps: {
            include: ['react', 'react-dom'],
        },
    },
});