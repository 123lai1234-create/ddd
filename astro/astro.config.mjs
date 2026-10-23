// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import ollamaChatIntegration from './dev/ollama-chat.mjs';
import ragIntegration from './dev/rag-search.mjs';

export default defineConfig({
    site: 'https://donttalk.vercel.app',
    integrations: [
        react(),
        ollamaChatIntegration(),
        ragIntegration(),
    ],
    build: {
        format: 'directory',
    },
    vite: {
        optimizeDeps: {
            include: ['react', 'react-dom'],
        },
    },
});