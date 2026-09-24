import assert from 'node:assert/strict';
import test from 'node:test';

import { AppBase } from 'playcanvas';
import { JSDOM } from 'jsdom';
import { EditorRuntime } from '../src/runtime/editor-runtime.mjs';

test('editor runtime initializes the application root and scene in Unreal coordinates', async (t) => {
    const dom = new JSDOM('<!doctype html><div><canvas id="viewport"></canvas></div>');
    const previous = new Map(['window', 'document', 'ResizeObserver'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.ResizeObserver = class {
        observe() {}

        disconnect() {}
    };

    const canvas = document.querySelector('canvas');
    canvas.hasPointerCapture = () => false;
    canvas.setPointerCapture = () => {};
    canvas.releasePointerCapture = () => {};

    let initializedApp = null;
    t.mock.method(AppBase.prototype, 'start', function () {
        initializedApp = this;
    });

    const events = [];
    const runtime = new EditorRuntime(canvas, event => events.push(event), { deviceTypes: ['null'] });
    t.after(() => {
        runtime.destroy();
        dom.window.close();
        for (const [name, descriptor] of previous) {
            if (descriptor) {
                Object.defineProperty(globalThis, name, descriptor);
            } else {
                delete globalThis[name];
            }
        }
    });

    await runtime.initialize();

    assert.ok(initializedApp, events.find(event => event.type === 'runtimeError')?.message);
    assert.equal(initializedApp.coordinateSystem, 'unreal');
    assert.equal(initializedApp.root.coordinateSystem, 'unreal');
    assert.equal(initializedApp.scene.coordinateSystem, 'unreal');
    assert.equal(events.some(event => event.type === 'ready'), true);
});
