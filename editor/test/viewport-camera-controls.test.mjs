import assert from 'node:assert/strict';
import test from 'node:test';

import { Entity, EventHandler, Vec3 } from 'playcanvas';
import { ViewportCameraControls } from '../src/runtime/viewport-camera-controls.mjs';

class FakeCanvas extends EventTarget {
    clientHeight = 800;

    capture = null;

    setPointerCapture(id) {
        this.capture = id;
    }

    hasPointerCapture(id) {
        return this.capture === id;
    }

    releasePointerCapture(id) {
        if (this.capture === id) {
            this.capture = null;
        }
    }
}

const setup = (t) => {
    const previous = new Map(['window', 'document', 'HTMLElement', 'WheelEvent'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    globalThis.window = new EventTarget();
    globalThis.document = { activeElement: null, pointerLockElement: null };
    globalThis.HTMLElement = class {
        isContentEditable = false;

        closest() {
            return true;
        }
    };
    globalThis.WheelEvent = { DOM_DELTA_LINE: 1, DOM_DELTA_PAGE: 2 };
    const canvas = new FakeCanvas();
    const app = new EventHandler();
    const camera = new Entity('camera');
    camera.camera = { fov: 45 };
    camera.setPosition(0, 5, 5);
    const navigation = [];
    const speeds = [];
    const controls = new ViewportCameraControls(app, camera, canvas, value => navigation.push(value), value => speeds.push(value));
    const emit = (type, values = {}, target = canvas) => {
        const event = new Event(type, { cancelable: true });
        Object.assign(event, { pointerId: 1, pointerType: 'mouse', screenX: 0, screenY: 0, buttons: 0, button: -1, altKey: false }, values);
        target.dispatchEvent(event);
        return event;
    };
    t.after(() => {
        controls.destroy();
        camera.destroy();
        for (const [name, descriptor] of previous) {
            if (descriptor) {
                Object.defineProperty(globalThis, name, descriptor);
            } else {
                delete globalThis[name];
            }
        }
    });
    return { canvas, controls, camera, navigation, speeds, emit, tick: (dt = 0.1) => app.fire('update', dt) };
};

test('left-first and right-first chords both pan without rotating', (t) => {
    const h = setup(t);
    const pan = (firstButton, firstButtons, secondButton) => {
        h.controls.reset(Vec3.ZERO, new Vec3(0, 5, 5));
        h.emit('pointerdown', { button: firstButton, buttons: firstButtons });
        h.emit('mousedown', { button: secondButton, buttons: 3 });
        const rotation = h.camera.getRotation().clone();
        const position = h.camera.getPosition().clone();
        h.emit('pointermove', { buttons: 3, screenX: 40, screenY: 20 });
        h.tick();
        assert.ok(h.camera.getRotation().equalsApprox(rotation));
        const delta = h.camera.getPosition().clone().sub(position);
        h.emit('pointerup', { button: 0, buttons: 0 });
        h.tick();
        return delta;
    };
    const leftFirst = pan(0, 1, 2);
    const rightFirst = pan(2, 2, 0);
    assert.ok(leftFirst.length() > 0);
    assert.ok(leftFirst.equalsApprox(rightFirst));
    assert.deepEqual(h.navigation, [true, false, true, false]);
});

test('chorded press and release update keyboard ownership without pointer movement', (t) => {
    const h = setup(t);
    h.emit('pointerdown', { button: 0, buttons: 1 });
    assert.deepEqual(h.navigation, []);
    h.emit('mousedown', { button: 2, buttons: 3 });
    assert.deepEqual(h.navigation, [true]);
    h.emit('mouseup', { button: 2, buttons: 1 }, window);
    assert.deepEqual(h.navigation, [true, false]);
    assert.equal(h.canvas.capture, 1);
    h.emit('pointermove', { buttons: 1, screenX: 20 });
    const before = h.camera.getRotation().clone();
    h.tick();
    assert.equal(h.camera.getRotation().equalsApprox(before), false);
    h.emit('pointerup', { button: 0, buttons: 0 });
    assert.equal(h.canvas.capture, null);
});

test('E/Q move only on world Y at every camera pitch, and require RMB', (t) => {
    const h = setup(t);
    for (const position of [new Vec3(0, 8, 2), new Vec3(0, -8, 2)]) {
        h.controls.reset(Vec3.ZERO, position);
        h.emit('pointerdown', { button: 2, buttons: 2 });
        h.emit('keydown', { code: 'KeyE' }, window);
        h.tick();
        const up = h.camera.getPosition().clone().sub(position);
        assert.ok(Math.abs(up.x) < 1e-8 && Math.abs(up.z) < 1e-8);
        assert.ok(Math.abs(up.y - 1) < 1e-8);
        h.emit('keyup', { code: 'KeyE' }, window);
        h.emit('keydown', { code: 'KeyQ' }, window);
        h.tick();
        assert.ok(h.camera.getPosition().equalsApprox(position));
        h.emit('pointerup', { button: 2, buttons: 0 });
        h.tick();
        assert.ok(h.camera.getPosition().equalsApprox(position));
        h.emit('keyup', { code: 'KeyQ' }, window);
        h.tick();
    }
});

test('LMB walks horizontally, RMB looks, Alt+LMB orbits the pivot', (t) => {
    const h = setup(t);
    const initial = h.camera.getPosition().clone();
    h.emit('pointerdown', { button: 0, buttons: 1 });
    h.emit('pointermove', { buttons: 1, screenY: -20 });
    h.tick();
    assert.equal(h.camera.getPosition().y, initial.y);
    assert.ok(h.camera.getPosition().z < initial.z);
    h.emit('pointerup');
    h.emit('pointerdown', { button: 2, buttons: 2 });
    const beforeLook = h.camera.getPosition().clone();
    h.emit('pointermove', { buttons: 2, screenX: 20, screenY: 10 });
    h.tick();
    assert.ok(h.camera.getPosition().equalsApprox(beforeLook));
    h.emit('pointerup');

    h.controls.reset(Vec3.ZERO, initial);
    h.emit('pointerdown', { button: 0, buttons: 1, altKey: true });
    h.emit('pointermove', { buttons: 1, altKey: true, screenX: 30 });
    h.tick();
    assert.ok(Math.abs(h.camera.getPosition().length() - initial.length()) < 1e-5);
    assert.equal(h.camera.getPosition().equalsApprox(initial), false);
    assert.ok(h.controls.focusPoint.equals(Vec3.ZERO));
});

test('wheel dollies while RMB wheel changes speed without moving the camera', (t) => {
    const h = setup(t);
    const before = h.camera.getPosition().clone();
    h.emit('wheel', { deltaY: -100, deltaMode: 0 });
    assert.ok(h.camera.getPosition().length() < before.length());
    h.emit('pointerdown', { button: 2, buttons: 2 });
    const beforeSpeed = h.camera.getPosition().clone();
    h.emit('wheel', { deltaY: -100, deltaMode: 0, buttons: 2 });
    assert.equal(h.controls.moveSpeed, 12);
    assert.deepEqual(h.speeds, [12]);
    assert.ok(h.camera.getPosition().equalsApprox(beforeSpeed));
});

test('Shift/Ctrl speed modifiers preserve their ratios after changing fly speed', (t) => {
    const h = setup(t);
    h.controls.reset(Vec3.ZERO, new Vec3(0, 0, 10));
    h.controls.setFlySpeed(20);
    h.emit('pointerdown', { button: 2, buttons: 2 });
    h.emit('keydown', { code: 'KeyW' }, window);
    h.tick();
    assert.equal(h.camera.getPosition().z, 8);
    h.emit('keydown', { code: 'ShiftLeft' }, window);
    h.tick();
    assert.equal(h.camera.getPosition().z, 4);
    h.emit('keyup', { code: 'ShiftLeft' }, window);
    h.emit('keydown', { code: 'ControlLeft' }, window);
    h.tick();
    assert.equal(h.camera.getPosition().z, 3);
});

test('middle-button and Alt navigation preserve orientation and move the camera', (t) => {
    const h = setup(t);
    for (const altKey of [false, true]) {
        const before = h.camera.getPosition().clone();
        const rotation = h.camera.getRotation().clone();
        h.emit('pointerdown', { button: 1, buttons: 4, altKey });
        h.emit('pointermove', { buttons: 4, altKey, screenX: 20, screenY: 10 });
        h.tick();
        assert.ok(h.camera.getRotation().equalsApprox(rotation));
        assert.equal(h.camera.getPosition().equalsApprox(before), false);
        h.emit('pointerup');
    }
    const distance = h.camera.getPosition().distance(h.controls.focusPoint);
    h.emit('pointerdown', { button: 2, buttons: 2, altKey: true });
    h.emit('pointermove', { buttons: 2, altKey: true, screenX: -30 });
    h.tick();
    assert.ok(h.camera.getPosition().distance(h.controls.focusPoint) < distance);
    assert.deepEqual(h.navigation, []);
});

test('cancel and capture loss end navigation and disabled gizmos suppress camera movement', (t) => {
    const h = setup(t);
    for (const type of ['pointercancel', 'lostpointercapture']) {
        h.emit('pointerdown', { button: 2, buttons: 2 });
        h.emit(type);
        h.tick();
    }
    assert.deepEqual(h.navigation, [true, false, true, false]);
    h.controls.enabled = false;
    const before = h.camera.getPosition().clone();
    h.emit('pointerdown', { button: 0, buttons: 1 });
    h.emit('pointermove', { buttons: 1, screenY: 50 });
    h.tick();
    assert.ok(h.camera.getPosition().equalsApprox(before));
    h.controls.enabled = true;
    h.emit('mousedown', { button: 2, buttons: 3 });
    h.tick();
    assert.deepEqual(h.navigation, [true, false, true, false, true]);
});

test('mouse movement before a chord switch is consumed with the previous mode', (t) => {
    const h = setup(t);
    h.emit('pointerdown', { button: 0, buttons: 1 });
    h.emit('pointermove', { buttons: 1, screenY: -20 });
    h.emit('mousedown', { button: 2, buttons: 3 });
    assert.equal(h.camera.getPosition().y, 5);
    assert.ok(h.camera.getPosition().z < 5);
    const afterWalk = h.camera.getPosition().clone();
    h.tick();
    assert.ok(h.camera.getPosition().equalsApprox(afterWalk));
});

test('blur releases input, and focused text controls never move the camera', (t) => {
    const h = setup(t);
    const before = h.camera.getPosition().clone();
    h.emit('pointerdown', { button: 2, buttons: 2 });
    h.emit('keydown', { code: 'KeyW' }, window);
    document.activeElement = new HTMLElement();
    h.tick();
    assert.ok(h.camera.getPosition().equalsApprox(before));
    document.activeElement = null;
    h.emit('blur', {}, window);
    h.tick();
    h.emit('pointerdown', { button: 2, buttons: 2 });
    h.tick();
    assert.ok(h.camera.getPosition().equalsApprox(before));
    assert.deepEqual(h.navigation, [true, false, true]);
});
