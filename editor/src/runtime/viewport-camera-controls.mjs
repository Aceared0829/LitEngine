import { KeyboardMouseSource, Vec3 } from 'playcanvas';

import { adjustFlySpeed, getWheelSteps } from './fly-speed.mjs';
import { getNavigationMode, isEditableTarget } from './navigation-input.mjs';

const MIN_DISTANCE = 0.05;
const LOOK_SENSITIVITY = 0.2;
const DRAG_SPEED = 0.01;

/**
 * Editor-only UE perspective controls. The engine's general-purpose CameraControls keep their
 * original orbit behavior. All camera motion here uses PlayCanvas's Y-up world coordinates.
 */
export class ViewportCameraControls {
    #camera;

    #canvas;

    #input;

    #updateHandle;

    #onNavigationChange;

    #onSpeedChange;

    #buttons = 0;

    #keys = [];

    #alt = false;

    #enabled = true;

    #navigating = false;

    #focus = new Vec3();

    #pitch = 0;

    #yaw = 0;

    #position = new Vec3();

    #offset = new Vec3();

    #forward = new Vec3();

    #right = new Vec3();

    #up = new Vec3();

    moveSpeed = 10;

    #onButtons = (buttons, event) => {
        const previousMode = getNavigationMode(this.#buttons, this.#alt);
        const nextAlt = event?.altKey ?? false;
        if (getNavigationMode(buttons, nextAlt) !== previousMode) {
            this.update(0);
        }
        this.#buttons = buttons;
        this.#alt = nextAlt;
        if (buttons) {
            this.#canvas.focus?.({ preventScroll: true });
        }
        if (this.#enabled && getNavigationMode(buttons, this.#alt) === 'orbit' && previousMode !== 'orbit') {
            this.reset(this.#focus, this.#camera.getPosition());
        }
        this.#syncNavigation();
    };

    #onModifiers = (event) => {
        const previousMode = getNavigationMode(this.#buttons, this.#alt);
        if (getNavigationMode(this.#buttons, event.altKey) !== previousMode) {
            this.update(0);
        }
        this.#alt = event.altKey;
        if (this.#enabled && getNavigationMode(this.#buttons, this.#alt) === 'orbit' && previousMode !== 'orbit') {
            this.reset(this.#focus, this.#camera.getPosition());
        }
        this.#syncNavigation();
    };

    #onBlur = () => {
        this.#input.read();
        this.#buttons = 0;
        this.#keys.fill(0);
        this.#alt = false;
        this.#syncNavigation();
    };

    #onWheel = (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!this.#enabled || isEditableTarget(document.activeElement)) {
            return;
        }
        const steps = getWheelSteps(event);
        if ((event.buttons & 2) && !event.altKey) {
            this.setFlySpeed(adjustFlySpeed(this.moveSpeed, steps));
        } else {
            this.#dolly(steps * 0.15);
        }
    };

    /**
     * @param {import('playcanvas').AppBase} app - Editor application.
     * @param {import('playcanvas').Entity} camera - Perspective camera entity.
     * @param {HTMLCanvasElement} canvas - Input surface.
     * @param {(active: boolean) => void} onNavigationChange - Keyboard ownership notification.
     * @param {(speed: number) => void} onSpeedChange - Camera speed notification.
     */
    constructor(app, camera, canvas, onNavigationChange, onSpeedChange) {
        this.#camera = camera;
        this.#canvas = canvas;
        this.#onNavigationChange = onNavigationChange;
        this.#onSpeedChange = onSpeedChange;
        this.reset(Vec3.ZERO, camera.getPosition());
        this.#input = new KeyboardMouseSource();
        this.#input.on('buttons:change', this.#onButtons);
        this.#input.attach(canvas);
        this.#updateHandle = app.on('update', dt => this.update(dt));
        canvas.addEventListener('wheel', this.#onWheel, { capture: true, passive: false });
        canvas.addEventListener('pointermove', this.#onModifiers, true);
        window.addEventListener('keydown', this.#onModifiers, true);
        window.addEventListener('keyup', this.#onModifiers, true);
        window.addEventListener('blur', this.#onBlur);
    }

    set enabled(value) {
        if (this.#enabled === value) {
            return;
        }
        this.#enabled = value;
        this.#input.deltas.mouse.read();
        this.#syncNavigation();
    }

    get enabled() {
        return this.#enabled;
    }

    /**
     * @param {number} speed - Requested world units per second.
     */
    setFlySpeed(speed) {
        if (Number.isFinite(speed) && speed > 0) {
            this.moveSpeed = Math.max(0.1, Math.min(1000, speed));
            this.#onSpeedChange(this.moveSpeed);
        }
    }

    get focusPoint() {
        return this.#focus;
    }

    /**
     * @param {Vec3} focus - Orbit pivot.
     */
    setPivot(focus) {
        this.#focus.copy(focus);
    }

    /**
     * @param {Vec3} focus - Point to frame.
     * @param {Vec3} position - Camera position.
     */
    reset(focus, position) {
        this.#focus.copy(focus);
        this.#position.copy(position);
        this.#offset.sub2(focus, position).normalize();
        this.#pitch = Math.asin(Math.max(-1, Math.min(1, this.#offset.y))) * 180 / Math.PI;
        this.#yaw = Math.atan2(-this.#offset.x, -this.#offset.z) * 180 / Math.PI;
        this.#camera.setPosition(this.#position);
        this.#camera.setEulerAngles(this.#pitch, this.#yaw, 0);
    }

    #syncNavigation() {
        const active = this.#enabled && !!(this.#buttons & 2) && !this.#alt;
        if (active !== this.#navigating) {
            this.#navigating = active;
            this.#onNavigationChange(active);
        }
    }

    #rotate(dx, dy) {
        this.#yaw -= dx * LOOK_SENSITIVITY;
        this.#pitch = Math.max(-89.5, Math.min(89.5, this.#pitch - dy * LOOK_SENSITIVITY));
        this.#camera.setEulerAngles(this.#pitch, this.#yaw, 0);
    }

    #move(offset) {
        this.#position.copy(this.#camera.getPosition()).add(offset);
        this.#camera.setPosition(this.#position);
        this.#focus.add(offset);
    }

    #dolly(amount) {
        const distance = Math.max(MIN_DISTANCE, this.#camera.getPosition().distance(this.#focus));
        const next = Math.max(MIN_DISTANCE, Math.min(10000, distance * Math.exp(amount)));
        this.#offset.copy(this.#camera.forward).mulScalar(distance - next);
        this.#camera.setPosition(this.#position.copy(this.#camera.getPosition()).add(this.#offset));
    }

    /**
     * @param {number} dt - Elapsed seconds.
     */
    update(dt) {
        const { key, mouse } = this.#input.read();
        for (let i = 0; i < key.length; i++) {
            this.#keys[i] = (this.#keys[i] ?? 0) + key[i];
        }
        if (!this.#enabled || isEditableTarget(document.activeElement)) {
            return;
        }
        const mode = getNavigationMode(this.#buttons, this.#alt);
        const [dx, dy] = mouse;
        const distance = Math.max(MIN_DISTANCE, this.#camera.getPosition().distance(this.#focus));
        if (dx || dy) {
            switch (mode) {
                case 'look': {
                    this.#rotate(dx, dy);
                    this.#focus.copy(this.#camera.forward).mulScalar(distance).add(this.#camera.getPosition());
                    break;
                }
                case 'walk': {
                    this.#rotate(dx, 0);
                    this.#forward.set(-Math.sin(this.#yaw * Math.PI / 180), 0, -Math.cos(this.#yaw * Math.PI / 180));
                    this.#move(this.#offset.copy(this.#forward).mulScalar(-dy * this.moveSpeed * DRAG_SPEED));
                    this.#focus.copy(this.#camera.forward).mulScalar(distance).add(this.#camera.getPosition());
                    break;
                }
                case 'pan': {
                    const worldPerPixel = 2 * distance * Math.tan(this.#camera.camera.fov * Math.PI / 360) / Math.max(1, this.#canvas.clientHeight);
                    this.#right.copy(this.#camera.right).mulScalar(-dx * worldPerPixel);
                    this.#up.copy(this.#camera.up).mulScalar(dy * worldPerPixel);
                    this.#move(this.#offset.add2(this.#right, this.#up));
                    break;
                }
                case 'orbit': {
                    this.#rotate(dx, dy);
                    this.#camera.setPosition(this.#position.copy(this.#camera.forward).mulScalar(-distance).add(this.#focus));
                    break;
                }
                case 'dolly':
                    this.#dolly((dx + dy) * DRAG_SPEED);
                    break;
            }
        }

        if (this.#navigating) {
            const code = KeyboardMouseSource.keyCode;
            const held = name => this.#keys[code[name]] ?? 0;
            const x = held('D') - held('A') + held('RIGHT') - held('LEFT');
            const y = held('E') - held('Q');
            const z = held('W') - held('S') + held('UP') - held('DOWN');
            this.#forward.copy(this.#camera.forward).mulScalar(z);
            this.#right.copy(this.#camera.right).mulScalar(x);
            this.#offset.add2(this.#forward, this.#right).add(this.#up.set(0, y, 0));
            if (this.#offset.lengthSq() > 0) {
                const multiplier = held('SHIFT') ? 2 : held('CTRL') ? 0.5 : 1;
                this.#move(this.#offset.normalize().mulScalar(this.moveSpeed * multiplier * Math.min(dt, 0.1)));
            }
        }
    }

    destroy() {
        this.#updateHandle.off();
        this.#input.destroy();
        this.#onBlur();
        this.#canvas.removeEventListener('wheel', this.#onWheel, true);
        this.#canvas.removeEventListener('pointermove', this.#onModifiers, true);
        window.removeEventListener('keydown', this.#onModifiers, true);
        window.removeEventListener('keyup', this.#onModifiers, true);
        window.removeEventListener('blur', this.#onBlur);
    }
}
