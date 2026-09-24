import assert from 'node:assert/strict';
import test from 'node:test';

import { EditorRuntime } from '../src/runtime/editor-runtime.mjs';
import { SceneAdapter } from '../src/runtime/scene-adapter.mjs';

const copy = transform => Object.fromEntries(Object.entries(transform).map(([field, values]) => [field, values.slice()]));

const createHarness = (t) => {
    const transforms = new Map([
        ['box', { position: [1, 0, 1], rotation: [0, 0, 0], scale: [1, 1, 1] }],
        ['cone', { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }]
    ]);
    t.mock.method(SceneAdapter.prototype, 'getTransform', (id) => {
        return transforms.has(id) ? copy(transforms.get(id)) : null;
    });
    t.mock.method(SceneAdapter.prototype, 'setTransform', (id, transform) => {
        if (!transforms.has(id)) {
            return null;
        }
        transforms.set(id, copy(transform));
        return copy(transform);
    });
    t.mock.method(SceneAdapter.prototype, 'getEntity', (id) => {
        return transforms.has(id) ? { name: id } : null;
    });
    const events = [];
    const runtime = new EditorRuntime({}, event => events.push(event));
    runtime.dispatch({ type: 'selectEntity', entityId: 'box' });
    return { runtime, events, transforms, current: id => transforms.get(id), history: () => events.filter(event => event.type === 'historyChanged') };
};

test('Inspector scrub previews live but commits one undoable transform', (t) => {
    const { runtime, events, current, history } = createHarness(t);
    runtime.dispatch({ type: 'beginTransformDrag', entityId: 'box', gestureId: 1 });
    runtime.dispatch({ type: 'previewTransformDrag', entityId: 'box', gestureId: 1, field: 'position', index: 0, value: 1.25 });
    runtime.dispatch({ type: 'previewTransformDrag', entityId: 'box', gestureId: 1, field: 'position', index: 0, value: 1.5 });
    assert.equal(current('box').position[0], 1.5);
    assert.equal(history().length, 0);
    assert.equal(events.filter(event => event.type === 'transformChanged').length, 2);
    runtime.dispatch({ type: 'endTransformDrag', entityId: 'box', gestureId: 1, label: 'Edit position' });
    assert.equal(history().length, 1);
    assert.equal(history()[0].history.undoLabel, 'Edit position');
    runtime.dispatch({ type: 'undo' });
    assert.equal(current('box').position[0], 1);
    runtime.dispatch({ type: 'redo' });
    assert.equal(current('box').position[0], 1.5);
    runtime.destroy();
});

test('cancel or selection change restores scrub and ignores stale gestures', (t) => {
    const { runtime, current, history } = createHarness(t);
    runtime.dispatch({ type: 'beginTransformDrag', entityId: 'box', gestureId: 10 });
    runtime.dispatch({ type: 'previewTransformDrag', entityId: 'box', gestureId: 10, field: 'scale', index: 0, value: 2 });
    runtime.dispatch({ type: 'cancelTransformDrag', entityId: 'box', gestureId: 10 });
    assert.equal(current('box').scale[0], 1);
    assert.equal(history().length, 0);
    runtime.dispatch({ type: 'previewTransformDrag', entityId: 'box', gestureId: 10, field: 'scale', index: 0, value: 3 });
    runtime.dispatch({ type: 'endTransformDrag', entityId: 'box', gestureId: 10, label: 'Late end' });
    assert.equal(current('box').scale[0], 1);

    runtime.dispatch({ type: 'beginTransformDrag', entityId: 'box', gestureId: 11 });
    runtime.dispatch({ type: 'previewTransformDrag', entityId: 'box', gestureId: 11, field: 'rotation', index: 1, value: 45 });
    runtime.dispatch({ type: 'selectEntity', entityId: 'cone' });
    assert.equal(current('box').rotation[1], 0);
    runtime.dispatch({ type: 'endTransformDrag', entityId: 'box', gestureId: 11, label: 'Late end' });
    assert.equal(history().length, 0);
    runtime.destroy();
});

test('reset and undo discard previews before reading scene state', (t) => {
    const { runtime, current, history } = createHarness(t);
    t.mock.method(SceneAdapter.prototype, 'getInitialTransform', id => ({ ...current(id), position: [1, 0, 1] }));
    runtime.dispatch({ type: 'beginTransformDrag', entityId: 'box', gestureId: 30 });
    runtime.dispatch({ type: 'previewTransformDrag', entityId: 'box', gestureId: 30, field: 'position', index: 0, value: 2 });
    runtime.dispatch({ type: 'resetTransformField', entityId: 'box', field: 'position' });
    assert.equal(current('box').position[0], 1);
    assert.equal(history().length, 0);
    runtime.dispatch({ type: 'beginTransformDrag', entityId: 'box', gestureId: 31 });
    runtime.dispatch({ type: 'previewTransformDrag', entityId: 'box', gestureId: 31, field: 'scale', index: 0, value: 2 });
    runtime.dispatch({ type: 'undo' });
    assert.equal(current('box').scale[0], 1);
    assert.equal(history().length, 0);
    runtime.destroy();
});

test('a scrub returned to its original value creates no history entry', (t) => {
    const { runtime, history } = createHarness(t);
    runtime.dispatch({ type: 'beginTransformDrag', entityId: 'box', gestureId: 40 });
    runtime.dispatch({ type: 'previewTransformDrag', entityId: 'box', gestureId: 40, field: 'position', index: 0, value: 1.1 });
    runtime.dispatch({ type: 'previewTransformDrag', entityId: 'box', gestureId: 40, field: 'position', index: 0, value: 1 });
    runtime.dispatch({ type: 'endTransformDrag', entityId: 'box', gestureId: 40, label: 'No change' });
    assert.equal(history().length, 0);
    runtime.destroy();
});

test('invalid preview is ignored and normal edits cancel an active scrub', (t) => {
    const { runtime, current, history } = createHarness(t);
    runtime.dispatch({ type: 'beginTransformDrag', entityId: 'box', gestureId: 20 });
    runtime.dispatch({ type: 'previewTransformDrag', entityId: 'box', gestureId: 20, field: 'position', index: 0, value: Infinity });
    assert.equal(current('box').position[0], 1);
    runtime.dispatch({ type: 'previewTransformDrag', entityId: 'box', gestureId: 20, field: 'position', index: 0, value: 2 });
    runtime.dispatch({ type: 'setTransform', entityId: 'box', transform: { ...current('box'), position: [3, 0, 1] } });
    assert.equal(current('box').position[0], 3);
    assert.equal(history().length, 1);
    runtime.dispatch({ type: 'undo' });
    assert.equal(current('box').position[0], 1);
    runtime.destroy();
});
