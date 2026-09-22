import { net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { sanitizeApplicationPath } from './url-policy.mjs';

const CSP = [
    'default-src \'none\'',
    'script-src \'self\'',
    'style-src \'self\' \'unsafe-inline\'',
    'img-src \'self\' data: blob:',
    'font-src \'self\' data:',
    'connect-src \'self\'',
    'media-src \'self\'',
    'worker-src \'self\' blob:',
    'object-src \'none\'',
    'base-uri \'none\'',
    'form-action \'none\'',
    'frame-src \'none\'',
    'frame-ancestors \'none\''
].join('; ');

const mimeTypes = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.mjs': 'text/javascript',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
};

export { sanitizeApplicationPath };

/**
 * Registers the packaged renderer protocol before Electron app readiness.
 *
 * @param {string} rendererDirectory - Absolute Vite dist directory.
 */
export const registerApplicationProtocol = (rendererDirectory) => {
    protocol.handle('lit-editor', async (request) => {
        const url = new URL(request.url);
        if (url.hostname !== 'app') {
            return new Response('Not found', { status: 404 });
        }

        const relativePath = sanitizeApplicationPath(url.pathname);
        if (!relativePath) {
            return new Response('Not found', { status: 404 });
        }

        const absolutePath = path.resolve(rendererDirectory, relativePath);
        const relativeToRenderer = path.relative(rendererDirectory, absolutePath);
        if (relativeToRenderer.startsWith('..') || path.isAbsolute(relativeToRenderer)) {
            return new Response('Not found', { status: 404 });
        }

        try {
            const response = await net.fetch(pathToFileURL(absolutePath).toString());
            if (!response.ok) {
                return new Response('Not found', { status: 404 });
            }
            const headers = new Headers(response.headers);
            headers.set('Content-Security-Policy', CSP);
            headers.set('Content-Type', mimeTypes[path.extname(absolutePath)] ?? 'application/octet-stream');
            return new Response(response.body, { status: response.status, headers });
        } catch {
            return new Response('Not found', { status: 404 });
        }
    });
};
