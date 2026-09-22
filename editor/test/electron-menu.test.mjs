import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { createEditorMenuTemplate } from '../electron/menu-template.mjs';
import { onDesktopEditorCommand } from '../src/platform/desktop-api.mjs';
import { EditorController } from '../src/bridge/editor-controller.mjs';
import { EditorRuntime } from '../src/runtime/editor-runtime.mjs';
import { TransformHistory } from '../src/runtime/transform-history.mjs';

test('native editor menu delegates clicks without intercepting renderer shortcuts', () => {
    const commands = [];
    const template = createEditorMenuTemplate({
        isDevelopment: false,
        sendEditorCommand: command => commands.push(command)
    });
    const actions = [
        ...template.find(item => item.label === 'Edit').submenu,
        ...template.find(item => item.label === 'View').submenu.filter(item => item.click)
    ];

    assert.deepEqual(actions.map(item => item.label), ['Undo', 'Redo', 'Frame Selection', 'Frame All']);
    assert.ok(actions.every(item => !('accelerator' in item)));
    actions.forEach(item => item.click());
    assert.deepEqual(commands, ['undo', 'redo', 'focusSelected', 'frameAll']);
});

test('sandbox preload exposes native commands using its built-in CommonJS bridge', (t) => {
    const preloadPath = fileURLToPath(new URL('../electron/preload.cjs', import.meta.url));
    const mainSource = fs.readFileSync(fileURLToPath(new URL('../electron/main.mjs', import.meta.url)), 'utf8');
    assert.ok(mainSource.includes('preload: path.join(__dirname, \'preload.cjs\')'));
    assert.equal(path.extname(preloadPath), '.cjs');

    let bridge;
    const listeners = new Map();
    vm.runInNewContext(fs.readFileSync(preloadPath, 'utf8'), {
        require: (id) => {
            assert.equal(id, 'electron');
            return {
                contextBridge: { exposeInMainWorld: (_name, api) => {
                    bridge = api;
                } },
                ipcRenderer: {
                    on: (channel, listener) => listeners.set(channel, listener),
                    removeListener: (channel, listener) => {
                        if (listeners.get(channel) === listener) {
                            listeners.delete(channel);
                        }
                    }
                }
            };
        }
    });

    const received = [];
    const unsubscribe = bridge.onEditorCommand(command => received.push(command));
    const listener = listeners.get('lit-editor:command');
    listener({}, 'undo');
    listener({}, 'frameAll');
    listener({}, 'invalid');
    assert.deepEqual(received, ['undo', 'frameAll']);
    unsubscribe();
    assert.equal(listeners.has('lit-editor:command'), false);

    const previous = Object.getOwnPropertyDescriptor(globalThis, 'litEngineDesktop');
    globalThis.litEngineDesktop = bridge;
    t.after(() => {
        if (previous) {
            Object.defineProperty(globalThis, 'litEngineDesktop', previous);
        } else {
            delete globalThis.litEngineDesktop;
        }
    });
    t.mock.method(EditorRuntime.prototype, 'initialize', async () => {});
    const undo = t.mock.method(TransformHistory.prototype, 'undo');
    const redo = t.mock.method(TransformHistory.prototype, 'redo');
    t.mock.method(EditorRuntime.prototype, 'dispatch');
    const controller = new EditorController({});
    const stop = onDesktopEditorCommand(command => controller.dispatch(command));
    const menu = createEditorMenuTemplate({
        isDevelopment: false,
        sendEditorCommand: command => listeners.get('lit-editor:command')({}, command)
    });
    menu.flatMap(item => item.submenu).filter(item => item.click).forEach(item => item.click());
    assert.deepEqual(EditorRuntime.prototype.dispatch.mock.calls.map(call => call.arguments[0]), [
        { type: 'undo' }, { type: 'redo' }, { type: 'focusSelected' }, { type: 'frameAll' }
    ]);
    listeners.get('lit-editor:command')({}, 'invalid');
    assert.equal(EditorRuntime.prototype.dispatch.mock.calls.length, 4);
    assert.equal(undo.mock.calls.length, 1);
    assert.equal(redo.mock.calls.length, 1);
    assert.equal(controller.getState().statusMessage, 'Scene has no frameable entities');
    stop();
    controller.dispose();
    assert.equal(listeners.size, 0);
});

test('development menu retains the DevTools entry', () => {
    const template = createEditorMenuTemplate({ isDevelopment: true, sendEditorCommand() {} });
    assert.ok(template.find(item => item.label === 'View').submenu.some(item => item.role === 'toggleDevTools'));
});
