import assert from 'node:assert/strict';
import test from 'node:test';

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

test('development menu retains the DevTools entry', () => {
    const template = createEditorMenuTemplate({ isDevelopment: true, sendEditorCommand() {} });
    assert.ok(template.find(item => item.label === 'View').submenu.some(item => item.role === 'toggleDevTools'));
});
