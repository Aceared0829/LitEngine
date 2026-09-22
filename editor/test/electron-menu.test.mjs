import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { createEditorMenuTemplate } from '../electron/menu-template.mjs';

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

test('sandbox preload exposes native commands using its built-in CommonJS bridge', () => {
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
});

test('development menu retains the DevTools entry', () => {
    const template = createEditorMenuTemplate({ isDevelopment: true, sendEditorCommand() {} });
    assert.ok(template.find(item => item.label === 'View').submenu.some(item => item.role === 'toggleDevTools'));
});
