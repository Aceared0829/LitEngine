import assert from 'node:assert/strict';
import test from 'node:test';

import { SelectionController } from '../src/runtime/selection-controller.mjs';

const createHarness = () => {
    const canvas = new EventTarget();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 });
    const pending = [];
    const picker = {
        resize() {},
        prepare() {},
        destroy() {},
        getSelectionAsync: () => new Promise((resolve) => {
            pending.push(resolve);
        })
    };
    const selected = [];
    let blocked = false;
    const controller = new SelectionController(canvas, { scene: {} }, {}, [], entity => selected.push(entity), () => blocked, picker);
    const pointer = (type, { button = 0, buttons = 1, altKey = false, pointerId = 1, clientX = 10, clientY = 10 } = {}) => {
        const event = new Event(type);
        Object.assign(event, { button, buttons, altKey, pointerId, clientX, clientY });
        canvas.dispatchEvent(event);
    };
    return {
        controller,
        pending,
        pointer,
        selected,
        setBlocked: (value) => {
            blocked = value;
        }
    };
};

test('selection ignores a pick superseded by a hierarchy selection', async () => {
    const harness = createHarness();
    harness.pointer('pointerdown');
    harness.pointer('pointerup');
    assert.equal(harness.pending.length, 1);
    harness.controller.invalidatePendingSelection();
    harness.pending[0]([{ node: { name: 'old entity' } }]);
    await Promise.resolve();
    assert.deepEqual(harness.selected, []);
    harness.controller.destroy();
});

test('selection ignores a pick after a new pointer gesture or gizmo capture', async () => {
    const harness = createHarness();
    harness.pointer('pointerdown');
    harness.pointer('pointerup');
    harness.pointer('pointerdown', { button: 2 });
    harness.pending[0]([{ node: { name: 'old entity' } }]);
    await Promise.resolve();
    assert.deepEqual(harness.selected, []);

    harness.pointer('pointerdown');
    harness.pointer('pointerup');
    harness.setBlocked(true);
    harness.pending[1]([{ node: { name: 'another entity' } }]);
    await Promise.resolve();
    assert.deepEqual(harness.selected, []);
    harness.controller.destroy();
});

test('gizmo-owned clicks never pick after pointerup clears the gizmo flag', () => {
    const harness = createHarness();
    harness.setBlocked(true);
    harness.pointer('pointerdown');
    harness.setBlocked(false);
    harness.pointer('pointerup');
    assert.equal(harness.pending.length, 0);
    harness.controller.destroy();
});

test('navigation gestures cannot turn into clicks when they end at their starting point', () => {
    const harness = createHarness();
    harness.pointer('pointerdown');
    harness.pointer('pointermove', { clientX: 40 });
    harness.pointer('pointerup');
    harness.pointer('pointerdown', { altKey: true });
    harness.pointer('pointerup');
    harness.pointer('pointerdown');
    harness.pointer('pointermove', { buttons: 3 });
    harness.pointer('pointerup');
    assert.equal(harness.pending.length, 0);
    harness.controller.destroy();
});

test('canceled pointer cannot complete a selection; valid click still can', async () => {
    const harness = createHarness();
    harness.pointer('pointerdown');
    harness.pointer('pointercancel');
    harness.pointer('pointerup');
    assert.equal(harness.pending.length, 0);

    harness.pointer('pointerdown');
    harness.pointer('pointerup');
    const entity = { name: 'Box' };
    harness.pending[0]([{ node: entity }]);
    await Promise.resolve();
    assert.deepEqual(harness.selected, [entity]);
    harness.controller.destroy();
});
