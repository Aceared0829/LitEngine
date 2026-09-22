import assert from 'node:assert/strict';
import test from 'node:test';

import { isTrustedRendererUrl, sanitizeApplicationPath } from '../electron/url-policy.mjs';

const production = { isDevelopment: false, developmentUrl: 'http://127.0.0.1:5173' };
const development = { isDevelopment: true, developmentUrl: 'http://127.0.0.1:5173' };

test('accepts only the Electron application origin in production', () => {
    assert.equal(isTrustedRendererUrl('lit-editor://app/index.html', production), true);
    assert.equal(isTrustedRendererUrl('lit-editor://app.evil/index.html', production), false);
    assert.equal(isTrustedRendererUrl('file:///C:/Windows/System32/cmd.exe', production), false);
    assert.equal(isTrustedRendererUrl('not-a-url', production), false);
    assert.equal(isTrustedRendererUrl('data:text/html,test', production), false);
});

test('accepts only the loopback development origin', () => {
    assert.equal(isTrustedRendererUrl('http://127.0.0.1:5173/', development), true);
    assert.equal(isTrustedRendererUrl('http://localhost:5173/', development), false);
    assert.equal(isTrustedRendererUrl('http://127.0.0.1:5174/', development), false);
});

test('sanitizes application asset paths', () => {
    assert.equal(sanitizeApplicationPath('/assets/index.js'), 'assets/index.js');
    assert.equal(sanitizeApplicationPath('/%2e%2e/secret.txt'), null);
    assert.equal(sanitizeApplicationPath('/../../secret.txt'), null);
    assert.equal(sanitizeApplicationPath('/assets%5c..%5csecret.txt'), null);
});
