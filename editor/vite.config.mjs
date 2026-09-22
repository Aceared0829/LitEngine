import path from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    server: {
        host: '127.0.0.1',
        port: 5173,
        strictPort: true,
        fs: {
            allow: [
                path.resolve('.'),
                path.resolve('..')
            ]
        }
    },
    preview: {
        host: '127.0.0.1',
        port: 4173
    }
});
