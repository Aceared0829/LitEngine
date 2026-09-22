import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { parseNumberDraft } from '../src/shell/number-draft.mjs';

test('numeric literals parse without executing expressions', () => {
    for (const value of ['', '-', '.', '1e', '1/0', '2+2', 'Infinity', '0x10', 'NaN', 'alert(1)']) {
        assert.equal(parseNumberDraft(value), null);
    }
    assert.equal(parseNumberDraft('0'), 0);
    assert.equal(parseNumberDraft('-0.5'), -0.5);
    assert.equal(parseNumberDraft('1e2'), 100);
});

test('Inspector and toolbar maintain current state through real React DOM events', async (t) => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
    const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'];
    const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    for (const name of names) {
        Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] });
    }
    const { act, createElement } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { InspectorPanel } = await import('../src/shell/InspectorPanel.mjs');
    const { Toolbar } = await import('../src/shell/Toolbar.mjs');
    const { NumberField } = await import('../src/shell/NumberField.mjs');
    const { initialEditorState } = await import('../src/domain/editor-reducer.mjs');
    const root = createRoot(document.getElementById('root'));
    t.after(async () => {
        await act(() => root.unmount());
        dom.window.close();
        for (const [name, descriptor] of previous) {
            if (descriptor) {
                Object.defineProperty(globalThis, name, descriptor);
            } else {
                delete globalThis[name];
            }
        }
    });
    const commands = [];
    const dispatch = command => commands.push(command);
    const box = { id: 'box', name: 'Box', type: 'box', components: ['render'], transform: { position: [1, 0, 1], rotation: [0, 0, 0], scale: [1, 1, 1] } };
    const cone = { ...box, id: 'cone', name: 'Cone', transform: { ...box.transform, scale: [1.5, 2.25, 1.5] } };
    let state = { ...initialEditorState, scene: { entities: [box, cone] }, selectedEntityId: 'box', runtimeStatus: 'ready' };
    const renderInspector = () => act(() => root.render(createElement(InspectorPanel, { state, dispatch, ready: true, collapsed: false })));
    const change = (selector, value) => act(() => {
        const input = document.querySelector(selector);
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    const enter = selector => act(() => document.querySelector(selector).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await renderInspector();
    state = { ...state, selectedEntityId: 'cone' };
    await renderInspector();
    assert.equal(commands.length, 0);
    assert.equal(document.querySelector('[aria-label="Scale X"]').value, '1.5');
    await change('[aria-label="Scale X"]', '2.5');
    assert.equal(commands.length, 0);
    await enter('[aria-label="Scale X"]');
    assert.equal(commands.length, 1);
    assert.equal(commands[0].entityId, 'cone');
    assert.deepEqual(commands[0].transform.scale, [2.5, 2.25, 1.5]);
    commands.length = 0;
    state = { ...state, selectedEntityId: 'box' };
    await renderInspector();
    assert.equal(document.querySelector('[aria-label="Scale X"]').value, '1');
    assert.equal(commands.length, 0);

    const speedCommits = [];
    await act(() => root.render(createElement(NumberField, { value: 10, label: 'Speed', min: 0.1, onCommit: value => speedCommits.push(value) })));
    await change('[aria-label="Speed"]', '');
    await change('[aria-label="Speed"]', '0.5');
    assert.deepEqual(speedCommits, []);
    await enter('[aria-label="Speed"]');
    assert.deepEqual(speedCommits, [0.5]);

    const renderToolbar = () => act(() => root.render(createElement(Toolbar, { state, dispatch, ready: true, isNavigationActive: () => false })));
    await renderToolbar();
    await act(() => document.querySelector('.snap-button').click());
    assert.equal(commands.at(-1).enabled, true);
    state = { ...state, snap: { ...state.snap, enabled: true }, coordinateSpace: 'local' };
    await renderToolbar();
    await act(() => document.querySelector('.snap-button').click());
    assert.equal(commands.at(-1).enabled, false);
    await act(() => document.querySelector('.coordinate-space').click());
    assert.equal(commands.at(-1).coordinateSpace, 'world');

    // Test coordinate space toggling via ~, `, Backquote, and x
    state = { ...state, coordinateSpace: 'world', activeTool: 'translate' };
    await renderToolbar();

    const dispatchKey = (init, target = window) => {
        const event = new dom.window.KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
        target.dispatchEvent(event);
        return event;
    };

    // ~ toggles world -> local
    let keyEvent = dispatchKey({ key: '~', code: 'Backquote' });
    assert.equal(keyEvent.defaultPrevented, true);
    assert.equal(commands.at(-1).type, 'setCoordinateSpace');
    assert.equal(commands.at(-1).coordinateSpace, 'local');

    // Update state to local and verify ~ toggles local -> world
    state = { ...state, coordinateSpace: 'local' };
    await renderToolbar();
    keyEvent = dispatchKey({ key: '~', code: 'Backquote' });
    assert.equal(commands.at(-1).coordinateSpace, 'world');

    // ` (backtick) toggles coordinate space
    state = { ...state, coordinateSpace: 'world' };
    await renderToolbar();
    dispatchKey({ key: '`', code: 'Backquote' });
    assert.equal(commands.at(-1).coordinateSpace, 'local');

    // event.code === 'Backquote' with alternative key toggles coordinate space
    state = { ...state, coordinateSpace: 'local' };
    await renderToolbar();
    dispatchKey({ key: 'Unidentified', code: 'Backquote' });
    assert.equal(commands.at(-1).coordinateSpace, 'world');

    // 'x' alias still toggles coordinate space
    state = { ...state, coordinateSpace: 'world' };
    await renderToolbar();
    dispatchKey({ key: 'x' });
    assert.equal(commands.at(-1).coordinateSpace, 'local');

    // Ignored when activeTool === 'scale'
    state = { ...state, activeTool: 'scale' };
    await renderToolbar();
    const commandCountBeforeScale = commands.length;
    dispatchKey({ key: '~', code: 'Backquote' });
    dispatchKey({ key: '`', code: 'Backquote' });
    dispatchKey({ key: 'x' });
    assert.equal(commands.length, commandCountBeforeScale);

    // Ignored when navigation is active
    let navActive = true;
    const renderNavToolbar = () => act(() => root.render(createElement(Toolbar, { state: { ...state, activeTool: 'translate' }, dispatch, ready: true, isNavigationActive: () => navActive })));
    await renderNavToolbar();
    const commandCountBeforeNav = commands.length;
    dispatchKey({ key: '~', code: 'Backquote' });
    dispatchKey({ key: '`', code: 'Backquote' });
    assert.equal(commands.length, commandCountBeforeNav);

    // Works when navigation becomes inactive
    navActive = false;
    await renderNavToolbar();
    dispatchKey({ key: '~', code: 'Backquote' });
    assert.equal(commands.at(-1).coordinateSpace, 'local');

    // Ignored when typing in an editable input target
    const input = document.createElement('input');
    document.body.appendChild(input);
    const commandCountBeforeInput = commands.length;
    dispatchKey({ key: '~', code: 'Backquote' }, input);
    assert.equal(commands.length, commandCountBeforeInput);
    input.remove();

    // Verify Viewport chrome and hint reflect coordinate space shortcut
    const { Viewport } = await import('../src/shell/Viewport.mjs');
    const canvasRef = { current: document.createElement('canvas') };
    await act(() => root.render(createElement(Viewport, { canvasRef, state: { ...state, coordinateSpace: 'world', activeTool: 'translate' }, dispatch })));
    const spaceIndicator = document.querySelector('.viewport-toolbar span[title*="~"]');
    assert.ok(spaceIndicator);
    assert.equal(spaceIndicator.textContent, 'World');
    const hint = document.querySelector('.viewport-hint');
    assert.ok(hint.textContent.includes('~ toggle space'));
});
