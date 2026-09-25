import assert from 'node:assert/strict';
import test from 'node:test';

import { AppBase, Gizmo, RotateGizmo, TranslateGizmo, Vec3 } from 'playcanvas';
import { JSDOM } from 'jsdom';

import { EditorRuntime } from '../src/runtime/editor-runtime.mjs';

const createRuntimeHarness = async (t) => {
    const dom = new JSDOM('<!doctype html><div><canvas id="viewport"></canvas></div>');
    const names = ['window', 'document', 'HTMLElement', 'ResizeObserver'];
    const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.ResizeObserver = class {
        observe() {}

        disconnect() {}
    };

    const canvas = document.querySelector('canvas');
    canvas.width = 800;
    canvas.height = 600;
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 600 });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 });
    canvas.hasPointerCapture = () => false;
    canvas.setPointerCapture = () => {};
    canvas.releasePointerCapture = () => {};

    let app = null;
    t.mock.method(AppBase.prototype, 'start', function () {
        app = this;
    });
    const handle = { node: { name: 'gizmo:xyz' } };
    t.mock.method(Gizmo.prototype, '_getSelection', (x) => {
        return x < 10 ? [] : [handle];
    });
    t.mock.method(TranslateGizmo.prototype, '_screenToPoint', (x, y) => new Vec3(x, y, 0));
    t.mock.method(RotateGizmo.prototype, '_screenToPoint', (x, y) => new Vec3(x, y, 0));

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

    const pointer = (type, { x = 400, y = 300, buttons = 1, button = 0, altKey = true, pointerId = 7 } = {}) => {
        const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
        for (const [key, value] of Object.entries({
            pointerType: 'mouse',
            pointerId,
            button,
            buttons,
            altKey,
            offsetX: x,
            offsetY: y,
            clientX: x,
            clientY: y
        })) {
            Object.defineProperty(event, key, { configurable: true, value });
        }
        canvas.dispatchEvent(event);
        return event;
    };

    return { app: () => app, canvas, events, pointer, runtime };
};

const findEntity = (app, name) => app.root.children.find(entity => entity.name === name) ?? null;

const eventsHasDuplicateHistory = (events) => {
    return events.some(event => event.type === 'historyChanged' && event.history.undoLabel?.startsWith('Duplicate '));
};

test('Alt+Move duplicates the selected entity, leaves the source still, and undoes/redoes one operation', async (t) => {
    const harness = await createRuntimeHarness(t);
    const { app, events, pointer, runtime } = harness;
    const source = findEntity(app(), 'Box');
    const sourcePosition = source.getPosition().toArray();
    const sceneEventCount = events.filter(event => event.type === 'sceneChanged').length;
    const selectionEventCount = events.filter(event => event.type === 'selectionChanged').length;
    runtime.dispatch({ type: 'setTransformTool', tool: 'translate' });

    pointer('pointerdown');
    const duplicate = findEntity(app(), 'Box Copy');
    assert.ok(duplicate, 'the copy is created as soon as an eligible gizmo drag starts');
    assert.equal(duplicate.enabled, false, 'the provisional copy stays hidden until it actually moves');
    assert.equal(events.filter(event => event.type === 'sceneChanged').length, sceneEventCount);
    assert.equal(events.filter(event => event.type === 'selectionChanged').length, selectionEventCount);
    assert.notEqual(duplicate, source);
    assert.deepEqual(source.getPosition().toArray(), sourcePosition);
    assert.deepEqual(duplicate.getPosition().toArray(), sourcePosition);

    pointer('pointermove', { x: 420, y: 300 });
    assert.equal(duplicate.enabled, true, 'the copy becomes visible on the first transform movement');
    assert.equal(events.filter(event => event.type === 'sceneChanged').length, sceneEventCount + 1);
    const movedPosition = duplicate.getPosition().toArray();
    assert.notDeepEqual(movedPosition, sourcePosition);
    assert.deepEqual(source.getPosition().toArray(), sourcePosition);
    pointer('pointerup', { buttons: 0 });
    pointer('mouseup', { buttons: 0 });

    const duplicateId = events.filter(event => event.type === 'selectionChanged').at(-1).entityId;
    const committedScene = events.filter(event => event.type === 'sceneChanged').at(-1).scene;
    assert.equal(committedScene.entities.some(entity => entity.id === duplicateId && entity.name === 'Box Copy'), true);
    assert.equal(events.filter(event => event.type === 'historyChanged').at(-1).history.undoLabel, 'Duplicate Move Box Copy');

    runtime.dispatch({ type: 'undo' });
    assert.equal(findEntity(app(), 'Box Copy'), null);
    assert.deepEqual(source.getPosition().toArray(), sourcePosition);
    assert.equal(events.filter(event => event.type === 'selectionChanged').at(-1).entityId, 'box');

    runtime.dispatch({ type: 'redo' });
    const restored = findEntity(app(), 'Box Copy');
    assert.equal(restored, duplicate, 'redo restores the same cloned runtime entity');
    assert.deepEqual(restored.getPosition().toArray(), movedPosition);
    assert.equal(events.filter(event => event.type === 'selectionChanged').at(-1).entityId, duplicateId);
});

test('Alt+Rotate applies rotation to the copy and preserves the source rotation', async (t) => {
    const harness = await createRuntimeHarness(t);
    const { app, pointer, runtime } = harness;
    const source = findEntity(app(), 'Box');
    const sourceRotation = source.getLocalRotation().clone();
    runtime.dispatch({ type: 'setTransformTool', tool: 'rotate' });

    pointer('pointerdown');
    const duplicate = findEntity(app(), 'Box Copy');
    pointer('pointermove', { x: 420, y: 300 });
    pointer('pointerup', { buttons: 0 });
    pointer('mouseup', { buttons: 0 });

    assert.notEqual(Math.abs(duplicate.getLocalRotation().dot(sourceRotation)), 1);
    assert.ok(Math.abs(Math.abs(source.getLocalRotation().dot(sourceRotation)) - 1) < 1e-6);
});

test('Alt click, empty-space Alt drag, Scale, and pointer cancellation do not leave copies', async (t) => {
    const harness = await createRuntimeHarness(t);
    const { app, pointer, runtime } = harness;
    runtime.dispatch({ type: 'setTransformTool', tool: 'translate' });

    pointer('pointerdown');
    pointer('pointerup', { buttons: 0 });
    pointer('mouseup', { buttons: 0 });
    assert.equal(findEntity(app(), 'Box Copy'), null, 'a handle click without movement rolls back the provisional copy');

    pointer('pointerdown', { x: 5 });
    pointer('pointermove', { x: 35, y: 300 });
    pointer('pointerup', { x: 35, y: 300, buttons: 0 });
    pointer('mouseup', { x: 35, y: 300, buttons: 0 });
    assert.equal(findEntity(app(), 'Box Copy'), null, 'Alt dragging empty space does not duplicate');

    runtime.dispatch({ type: 'setTransformTool', tool: 'scale' });
    pointer('pointerdown');
    pointer('pointerup', { buttons: 0 });
    pointer('mouseup', { buttons: 0 });
    assert.equal(findEntity(app(), 'Box Copy'), null, 'Scale mode does not duplicate');

    runtime.dispatch({ type: 'setTransformTool', tool: 'translate' });
    pointer('pointerdown');
    pointer('pointermove', { x: 420, y: 300 });
    pointer('pointercancel', { buttons: 0 });
    assert.equal(findEntity(app(), 'Box Copy'), null, 'pointer cancellation removes the provisional copy');
    assert.equal(eventsHasDuplicateHistory(harness.events), false);
});

test('Reset Scene removes created copies and restores the initial scene', async (t) => {
    const harness = await createRuntimeHarness(t);
    const { app, pointer, runtime } = harness;
    const source = findEntity(app(), 'Box');
    const sourcePosition = source.getPosition().toArray();
    runtime.dispatch({ type: 'setTransformTool', tool: 'translate' });

    pointer('pointerdown');
    pointer('pointermove', { x: 420, y: 300 });
    pointer('pointerup', { buttons: 0 });
    pointer('mouseup', { buttons: 0 });
    assert.ok(findEntity(app(), 'Box Copy'));

    runtime.dispatch({ type: 'resetScene' });

    assert.equal(findEntity(app(), 'Box Copy'), null);
    assert.deepEqual(source.getPosition().toArray(), sourcePosition);
    assert.equal(harness.events.filter(event => event.type === 'sceneChanged').at(-1).scene.entities.some(entity => entity.name === 'Box Copy'), false);
    assert.equal(harness.events.filter(event => event.type === 'historyChanged').at(-1).history.canUndo, false);
});
