import { InputSource } from '../input.js';
import { movementState } from '../utils.js';

const PASSIVE = /** @type {AddEventListenerOptions & EventListenerOptions} */ ({ passive: false });
const BUTTON_MASKS = [1, 4, 2];
const KEY_CODES = /** @type {const} */ ({
    A: 0,
    B: 1,
    C: 2,
    D: 3,
    E: 4,
    F: 5,
    G: 6,
    H: 7,
    I: 8,
    J: 9,
    K: 10,
    L: 11,
    M: 12,
    N: 13,
    O: 14,
    P: 15,
    Q: 16,
    R: 17,
    S: 18,
    T: 19,
    U: 20,
    V: 21,
    W: 22,
    X: 23,
    Y: 24,
    Z: 25,
    '0': 26,
    '1': 27,
    '2': 28,
    '3': 29,
    '4': 30,
    '5': 31,
    '6': 32,
    '7': 33,
    '8': 34,
    '9': 35,
    UP: 36,
    DOWN: 37,
    LEFT: 38,
    RIGHT: 39,
    SPACE: 40,
    SHIFT: 41,
    CTRL: 42
});
const KEY_COUNT = Object.keys(KEY_CODES).length;

const array = Array(KEY_COUNT).fill(0);

/**
 * Keyboard and mouse input source class. Attached to an element, it accumulates `key` deltas for
 * the keys listed in {@link keyCode}, `button` deltas for the mouse buttons, `mouse` deltas for
 * pointer movement and `wheel` deltas for the scroll wheel. Pass `pointerLock: true` to use
 * pointer lock for mouse movement.
 *
 * @category Input
 * @alpha
 *
 * @typedef {object} KeyboardMouseSourceDeltas
 * @property {number[]} key - The key deltas.
 * @property {number[]} button - The button deltas.
 * @property {number[]} mouse - The mouse deltas.
 * @property {number[]} wheel - The wheel deltas.
 * @augments {InputSource<KeyboardMouseSourceDeltas>}
 */
class KeyboardMouseSource extends InputSource {
    /**
     * @type {ReturnType<typeof movementState>}
     * @private
     */
    _movementState = movementState();

    /**
     * The key codes for the keyboard keys.
     *
     * @readonly
     */
    static keyCode = KEY_CODES;

    /**
     * Fired when the held mouse-button mask changes, including chorded presses and releases.
     * The callback receives the DOM buttons bitmask and the originating event, or undefined
     * for the event when focus loss clears the buttons.
     *
     * @event
     */
    static EVENT_BUTTONSCHANGE = 'buttons:change';

    /** @private */
    _pointerId = -1;

    /**
     * @type {boolean}
     * @private
     */
    _pointerLock;

    /**
     * @type {Map<string, number>}
     * @private
     */
    _keyMap = new Map();

    /**
     * @type {number[]}
     * @private
     */
    _keyPrev = Array(KEY_COUNT).fill(0);

    /**
     * @type {number[]}
     * @private
     */
    _keyNow = Array(KEY_COUNT).fill(0);

    /**
     * @type {number[]}
     */
    _button = Array(3).fill(0);

    /**
     * @param {object} [options] - The options.
     * @param {boolean} [options.pointerLock] - Whether to enable pointer lock.
     */
    constructor({ pointerLock = false } = {}) {
        super({
            key: Array(KEY_COUNT).fill(0),
            button: [0, 0, 0],
            mouse: [0, 0],
            wheel: [0]
        });

        this._pointerLock = pointerLock ?? false;

        const { keyCode } = KeyboardMouseSource;

        // Alphabetical keys
        for (let i = 0; i < 26; i++) {
            const code = `Key${String.fromCharCode('A'.charCodeAt(0) + i)}`;
            this._keyMap.set(code, keyCode.A + i);
        }

        // Numeric keys
        for (let i = 0; i < 10; i++) {
            const code = `Digit${i}`;
            this._keyMap.set(code, keyCode['0'] + i);
        }

        // Arrow keys
        this._keyMap.set('ArrowUp', keyCode.UP);
        this._keyMap.set('ArrowDown', keyCode.DOWN);
        this._keyMap.set('ArrowLeft', keyCode.LEFT);
        this._keyMap.set('ArrowRight', keyCode.RIGHT);

        // Special keys
        this._keyMap.set('Space', keyCode.SPACE);
        this._keyMap.set('ShiftLeft', keyCode.SHIFT);
        this._keyMap.set('ShiftRight', keyCode.SHIFT);
        this._keyMap.set('ControlLeft', keyCode.CTRL);
        this._keyMap.set('ControlRight', keyCode.CTRL);

        this._onWheel = this._onWheel.bind(this);
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onContextMenu = this._onContextMenu.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onMouseButtons = this._onMouseButtons.bind(this);
        this._onBlur = this._onBlur.bind(this);
    }

    /**
     * @param {WheelEvent} event - The wheel event.
     * @private
     */
    _onWheel(event) {
        event.preventDefault();
        this.deltas.wheel.append([event.deltaY]);
    }

    /**
     * @param {PointerEvent} event - The pointer event.
     * @private
     */
    _onPointerDown(event) {
        if (event.pointerType !== 'mouse' || (this._pointerId !== -1 && this._pointerId !== event.pointerId)) {
            return;
        }
        this._pointerId = event.pointerId;
        this._movementState.down(event);
        if (this._pointerLock) {
            if (document.pointerLockElement !== this._element) {
                this._element?.requestPointerLock();
            }
        } else {
            this._element?.setPointerCapture(event.pointerId);
        }

        this._updateButtons(event.buttons, event);
    }

    /**
     * @param {PointerEvent} event - The pointer event.
     * @private
     */
    _onPointerMove(event) {
        // Use native movementX/Y when pointer lock is active, otherwise use custom calculation
        const [movementX, movementY] = this._pointerLock && document.pointerLockElement === this._element ?
            [event.movementX, event.movementY] :
            this._movementState.move(event);

        if (event.pointerType !== 'mouse') {
            return;
        }
        if (event.target !== this._element) {
            return;
        }
        if (this._pointerLock) {
            if (document.pointerLockElement !== this._element) {
                return;
            }
        } else {
            if (this._pointerId !== event.pointerId) {
                return;
            }
        }

        this._updateButtons(event.buttons, event);
        this.deltas.mouse.append([movementX, movementY]);
    }

    /**
     * @param {PointerEvent} event - The pointer event.
     * @private
     */
    _onPointerUp(event) {
        if (event.pointerType !== 'mouse' || event.pointerId !== this._pointerId) {
            return;
        }
        if (event.type === 'pointerleave' && (this._pointerLock || this._element?.hasPointerCapture(event.pointerId))) {
            return;
        }
        this._movementState.up(event);
        this._pointerId = -1;
        this._updateButtons(0, event);
        if (!this._pointerLock && this._element?.hasPointerCapture(event.pointerId)) {
            this._element.releasePointerCapture(event.pointerId);
        }
    }

    /**
     * Mouse events also report chord changes without a pointerdown or pointerup.
     *
     * @param {MouseEvent} event - Mouse button transition.
     * @private
     */
    _onMouseButtons(event) {
        if (this._pointerId !== -1) {
            this._updateButtons(event.buttons, event);
        }
    }

    /**
     * Clears held inputs on focus loss so keys cannot remain latched.
     *
     * @private
     */
    _onBlur() {
        const pointerId = this._pointerId;
        this._pointerId = -1;
        this._movementState = movementState();
        this._keyNow.fill(0);
        this._updateButtons(0);
        this.deltas.mouse.read();
        this.deltas.wheel.read();
        if (!this._pointerLock && this._element?.hasPointerCapture(pointerId)) {
            this._element.releasePointerCapture(pointerId);
        }
    }

    /**
     * @param {MouseEvent} event - The mouse event.
     * @private
     */
    _onContextMenu(event) {
        event.preventDefault();
    }

    /**
     * @param {KeyboardEvent} event - The keyboard event.
     * @private
     */
    _onKeyDown(event) {
        if (this._pointerLock && document.pointerLockElement !== this._element) {
            return;
        }
        event.stopPropagation();
        this._setKey(event.code, 1);
    }

    /**
     * @param {KeyboardEvent} event - The keyboard event.
     * @private
     */
    _onKeyUp(event) {
        event.stopPropagation();
        this._setKey(event.code, 0);
    }

    /**
     * @param {number} buttons - DOM held-button bitmask (left, right, middle).
     * @param {MouseEvent | PointerEvent} [event] - Originating input event.
     * @private
     */
    _updateButtons(buttons, event) {
        const delta = BUTTON_MASKS.map((mask, index) => {
            const held = +(!!(buttons & mask));
            const change = held - this._button[index];
            this._button[index] = held;
            return change;
        });
        if (delta.some(value => value !== 0)) {
            this.deltas.button.append(delta);
            this.fire(KeyboardMouseSource.EVENT_BUTTONSCHANGE, buttons, event);
        }
    }

    /**
     * @param {string} code - The code.
     * @param {number} value - The value.
     * @private
     */
    _setKey(code, value) {
        if (!this._keyMap.has(code)) {
            return;
        }
        this._keyNow[this._keyMap.get(code) ?? 0] = value;
    }

    /**
     * @param {HTMLElement} element - The element.
     */
    attach(element) {
        super.attach(element);

        this._element = element;
        this._element.addEventListener('wheel', this._onWheel, PASSIVE);
        this._element.addEventListener('pointerdown', this._onPointerDown);
        this._element.addEventListener('pointermove', this._onPointerMove);
        this._element.addEventListener('pointerup', this._onPointerUp);
        this._element.addEventListener('pointercancel', this._onPointerUp);
        this._element.addEventListener('pointerleave', this._onPointerUp);
        this._element.addEventListener('lostpointercapture', this._onPointerUp);
        this._element.addEventListener('contextmenu', this._onContextMenu);
        this._element.addEventListener('mousedown', this._onMouseButtons);
        window.addEventListener('mouseup', this._onMouseButtons);
        window.addEventListener('blur', this._onBlur);

        window.addEventListener('keydown', this._onKeyDown, false);
        window.addEventListener('keyup', this._onKeyUp, false);
    }

    detach() {
        if (!this._element) {
            return;
        }
        this._element.removeEventListener('wheel', this._onWheel, PASSIVE);
        this._element.removeEventListener('pointerdown', this._onPointerDown);
        this._element.removeEventListener('pointermove', this._onPointerMove);
        this._element.removeEventListener('pointerup', this._onPointerUp);
        this._element.removeEventListener('pointercancel', this._onPointerUp);
        this._element.removeEventListener('pointerleave', this._onPointerUp);
        this._element.removeEventListener('lostpointercapture', this._onPointerUp);
        this._element.removeEventListener('contextmenu', this._onContextMenu);
        this._element.removeEventListener('mousedown', this._onMouseButtons);
        window.removeEventListener('mouseup', this._onMouseButtons);
        window.removeEventListener('blur', this._onBlur);
        this._onBlur();

        window.removeEventListener('keydown', this._onKeyDown, false);
        window.removeEventListener('keyup', this._onKeyUp, false);

        this._keyNow.fill(0);
        this._keyPrev.fill(0);

        super.detach();
    }

    /** @override */
    read() {
        for (let i = 0; i < array.length; i++) {
            array[i] = this._keyNow[i] - this._keyPrev[i];
            this._keyPrev[i] = this._keyNow[i];
        }
        this.deltas.key.append(array);

        return super.read();
    }
}

export { KeyboardMouseSource };
