import { Application } from '../src/framework/application.js';
import { NullGraphicsDevice } from '../src/platform/graphics/null/null-graphics-device.js';

/**
 * Create a legacy-mode application for tests that exercise existing PlayCanvas behavior.
 * @param {object} [options] - Additional application options.
 * @param {'legacy'|'unreal'} [options.coordinateSystem] - World-coordinate convention. Defaults
 * to legacy for compatibility-focused regression tests.
 * @returns {Application} The new application instance.
 */
function createApp(options = {}) {
    const canvas = document.createElement('canvas');
    const graphicsDevice = new NullGraphicsDevice(canvas);
    return new Application(canvas, { coordinateSystem: 'legacy', ...options, graphicsDevice });
}

export { createApp };
