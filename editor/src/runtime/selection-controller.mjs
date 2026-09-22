import { Picker, Vec2 } from 'playcanvas';

/**
 * @import { AppBase, CameraComponent, Entity, Layer } from 'playcanvas'
 */

const CLICK_TOLERANCE = 3;

/**
 * Translates canvas-local pointer clicks into sequenced asynchronous scene picking.
 */
export class SelectionController {
    /** @type {HTMLCanvasElement} */
    #canvas;

    /** @type {Picker} */
    #picker;

    /** @type {AppBase} */
    #app;

    /** @type {CameraComponent} */
    #camera;

    /** @type {Layer[]} */
    #layers;

    /** @type {(entity: Entity | null) => void} */
    #onSelection;

    /** @type {() => boolean} */
    #isInteractionBlocked;

    #pointerDown = new Vec2();

    /** @type {number | null} */
    #pointerId = null;

    #requestId = 0;

    /** @type {(event: PointerEvent) => void} */
    #onPointerDown = (event) => {
        if (event.button !== 0) {
            return;
        }
        this.#pointerId = event.pointerId;
        this.#pointerDown.set(event.clientX, event.clientY);
    };

    /** @type {(event: PointerEvent) => Promise<void>} */
    #onPointerUp = async (event) => {
        if (event.button !== 0 || event.pointerId !== this.#pointerId) {
            return;
        }
        this.#pointerId = null;

        if (this.#isInteractionBlocked() ||
            Math.abs(event.clientX - this.#pointerDown.x) > CLICK_TOLERANCE ||
            Math.abs(event.clientY - this.#pointerDown.y) > CLICK_TOLERANCE) {
            return;
        }

        const requestId = ++this.#requestId;
        const bounds = this.#canvas.getBoundingClientRect();
        this.#picker.resize(bounds.width, bounds.height);
        this.#picker.prepare(this.#camera, this.#app.scene, this.#layers);
        const selection = await this.#picker.getSelectionAsync(
            event.clientX - bounds.left - 1,
            event.clientY - bounds.top - 1,
            2,
            2
        );

        if (requestId !== this.#requestId) {
            return;
        }
        this.#onSelection(/** @type {Entity | null} */ (selection[0]?.node ?? null));
    };

    /**
     * @param {HTMLCanvasElement} canvas - Runtime canvas.
     * @param {AppBase} app - PlayCanvas application.
     * @param {CameraComponent} camera - Viewport camera.
     * @param {Layer[]} layers - Pickable scene layers.
     * @param {(entity: Entity | null) => void} onSelection - Selection callback.
     * @param {() => boolean} isInteractionBlocked - Whether a gizmo drag is active.
     */
    constructor(canvas, app, camera, layers, onSelection, isInteractionBlocked) {
        this.#canvas = canvas;
        this.#app = app;
        this.#camera = camera;
        this.#layers = layers;
        this.#onSelection = onSelection;
        this.#isInteractionBlocked = isInteractionBlocked;
        this.#picker = new Picker(app, canvas.clientWidth, canvas.clientHeight);

        canvas.addEventListener('pointerdown', this.#onPointerDown);
        canvas.addEventListener('pointerup', this.#onPointerUp);
    }

    destroy() {
        this.#requestId++;
        this.#canvas.removeEventListener('pointerdown', this.#onPointerDown);
        this.#canvas.removeEventListener('pointerup', this.#onPointerUp);
        this.#picker.destroy();
    }
}
