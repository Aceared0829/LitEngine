import {
    Gizmo,
    RotateGizmo,
    ScaleGizmo,
    TranslateGizmo,
    unrealRotationToEuler
} from 'playcanvas';

/**
 * @import { CameraComponent, Entity, SnapSettings, Transform, TransformTool } from '../contracts/editor-contracts.mjs'
 */

/**
 * Owns transform gizmos and encapsulates all engine-side manipulation concerns.
 */
export class TransformController {
    /** @type {Record<'translate'|'rotate'|'scale', import('playcanvas').TransformGizmo>} */
    #gizmos;

    /** @type {TransformTool} */
    #tool = 'select';

    /** @type {Entity | null} */
    #entity = null;

    /** @type {(active: boolean) => void} */
    #onPointerActivity;

    /** @type {(transform: Transform) => void} */
    #onTransformChange;

    /** @type {(before: Transform, after: Transform, label: string, duplicate: boolean) => boolean | void} */
    #onTransformCommit;

    /** @type {() => Entity | null} */
    #onDuplicateStart;

    /** @type {() => Entity | null} */
    #onDuplicateCancel;

    /** @type {Transform | null} */
    #transformStart = null;

    #canvas;

    #pointerId = null;

    #navigationGesture = false;

    #duplicateGesture = false;

    #duplicateActive = false;

    #suppressCommit = false;

    #onPointerDown = (event) => {
        if (event.pointerType !== 'mouse') {
            return;
        }
        this.#pointerId = event.pointerId;
        this.#duplicateGesture = false;
        this.#duplicateActive = false;
        this.#navigationGesture = event.altKey || event.buttons !== 1;

        const canDuplicate = event.altKey && event.button === 0 && event.buttons === 1 &&
            (this.#tool === 'translate' || this.#tool === 'rotate') && this.#entity && this.gizmo;
        const hit = canDuplicate && this.#gizmoHitTest(event.offsetX, event.offsetY);
        if (hit) {
            this.#onPointerActivity(true);
            this.#duplicateGesture = true;
            const duplicate = this.#onDuplicateStart();
            if (duplicate) {
                this.#entity = duplicate;
                this.gizmo?.attach([duplicate]);
                this.#navigationGesture = false;
            } else {
                this.#duplicateGesture = false;
                this.#onPointerActivity(false);
            }
        }

        if (this.gizmo) {
            this.gizmo.mouseButtons[0] = !this.#navigationGesture;
        }
    };

    #onPointerState = (event) => {
        if (event.pointerId !== undefined && event.pointerId !== this.#pointerId) {
            return;
        }
        if (this.#pointerId === null) {
            return;
        }
        if (event.buttons !== 1 || (event.altKey && !this.#duplicateGesture)) {
            this.#navigationGesture = true;
            if (this.#transformStart) {
                this.gizmo?.detach();
                this.#attach();
            }
        }
        if (this.gizmo) {
            this.gizmo.mouseButtons[0] = !this.#navigationGesture || event.buttons === 0;
        }
        if (event.buttons === 0) {
            this.#pointerId = null;
            this.#navigationGesture = false;
        }
    };

    #onCancel = () => {
        if (this.#cancelDuplicateGesture()) {
            return;
        }
        if (this.#transformStart) {
            this.gizmo?.detach();
            this.#attach();
        }
        this.#pointerId = null;
        this.#navigationGesture = false;
        if (this.gizmo) {
            this.gizmo.mouseButtons[0] = true;
        }
    };

    /** @type {SnapSettings} */
    #snap = {
        enabled: false,
        translateIncrement: 1,
        rotateIncrement: 5,
        scaleIncrement: 1
    };

    /**
     * @param {CameraComponent} camera - Viewport camera component.
     * @param {(active: boolean) => void} onPointerActivity - Reports real gizmo pointer capture.
     * @param {(transform: Transform) => void} onTransformChange - Reports transform previews.
     * @param {(before: Transform, after: Transform, label: string, duplicate: boolean) => boolean | void} onTransformCommit - Reports committed gizmo drag and duplicate success.
     * @param {() => Entity | null} onDuplicateStart - Creates and selects a provisional duplicate.
     * @param {() => Entity | null} onDuplicateCancel - Removes a provisional duplicate and returns the source entity.
     */
    constructor(camera, onPointerActivity, onTransformChange, onTransformCommit, onDuplicateStart, onDuplicateCancel) {
        const layer = Gizmo.createLayer(camera.system.app);
        this.#onPointerActivity = onPointerActivity;
        this.#onTransformChange = onTransformChange;
        this.#onTransformCommit = onTransformCommit;
        this.#onDuplicateStart = onDuplicateStart;
        this.#onDuplicateCancel = onDuplicateCancel;
        this.#gizmos = {
            translate: new TranslateGizmo(camera, layer),
            rotate: new RotateGizmo(camera, layer),
            scale: new ScaleGizmo(camera, layer)
        };

        for (const gizmo of Object.values(this.#gizmos)) {
            gizmo.mouseButtons[1] = false;
            gizmo.mouseButtons[2] = false;
            gizmo.on('pointer:down', (_x, _y, meshInstance) => {
                this.#onPointerActivity(Boolean(meshInstance));
            });
            gizmo.on('pointer:up', () => this.#onPointerActivity(false));
            gizmo.on('transform:start', () => {
                this.#transformStart = this.#getTransform();
                this.#duplicateActive = this.#duplicateGesture;
            });
            gizmo.on('transform:move', () => this.#notifyTransform());
            gizmo.on('transform:end', () => this.#commitTransform());
        }
        this.#canvas = camera.system.app.graphicsDevice.canvas;
        this.#canvas.addEventListener('pointerdown', this.#onPointerDown, true);
        this.#canvas.addEventListener('pointermove', this.#onPointerState, true);
        this.#canvas.addEventListener('mousedown', this.#onPointerState, true);
        window.addEventListener('mouseup', this.#onPointerState, true);
        this.#canvas.addEventListener('pointercancel', this.#onCancel);
        this.#canvas.addEventListener('lostpointercapture', this.#onCancel);
        window.addEventListener('blur', this.#onCancel);
        this.#applySnap();
    }

    /**
     * @param {TransformTool} tool - Tool to activate.
     */
    setTool(tool) {
        if (this.#tool === tool) {
            return;
        }

        this.#cancelDuplicateGesture();
        this.gizmo?.detach();
        this.#tool = tool;
        this.#applySnap();
        this.#attach();
    }

    /**
     * @param {'world'|'local'} coordinateSpace - Axis orientation.
     */
    setCoordinateSpace(coordinateSpace) {
        for (const [type, gizmo] of Object.entries(this.#gizmos)) {
            if (type !== 'scale') {
                gizmo.coordSpace = coordinateSpace;
            }
        }
    }

    /**
     * @param {boolean} enabled - Snap enabled state.
     */
    setSnapEnabled(enabled) {
        this.#snap.enabled = enabled;
        this.#applySnap();
    }

    /**
     * @param {Exclude<TransformTool, 'select'>} tool - Snap setting to update.
     * @param {number} increment - Positive snap increment.
     */
    setSnapIncrement(tool, increment) {
        if (!Number.isFinite(increment) || increment <= 0) {
            return;
        }
        this.#snap[`${tool}Increment`] = increment;
        this.#applySnap();
    }

    /**
     * @returns {SnapSettings} Snap settings snapshot.
     */
    get snap() {
        return { ...this.#snap };
    }

    /**
     * @returns {'world'|'local'} Effective space for the active tool.
     */
    get effectiveCoordinateSpace() {
        return this.#tool === 'scale' ? 'local' : (this.gizmo?.coordSpace ?? 'world');
    }

    /**
     * @param {Entity | null} entity - Entity to manipulate.
     */
    select(entity) {
        this.gizmo?.detach();
        this.#entity = entity;
        this.#attach();
    }

    /**
     * @returns {import('playcanvas').TransformGizmo | null} Active gizmo.
     */
    get gizmo() {
        return this.#tool === 'select' ? null : this.#gizmos[this.#tool];
    }

    /**
     * Cancels a provisional duplicate gesture, if one is in progress.
     */
    cancelActiveGesture() {
        this.#cancelDuplicateGesture();
    }

    #attach() {
        if (this.#entity && this.gizmo) {
            this.gizmo.attach([this.#entity]);
        }
    }

    /**
     * Checks the active gizmo before its pointer handler starts recording drag state.
     *
     * @param {number} x - Canvas-local pointer X.
     * @param {number} y - Canvas-local pointer Y.
     * @returns {boolean} Whether a transform handle was hit.
     */
    #gizmoHitTest(x, y) {
        const gizmo = this.gizmo;
        return Boolean(gizmo?._getSelection(x, y).length);
    }

    /**
     * Rolls back a provisional duplicate and resets pointer ownership.
     *
     * @returns {boolean} Whether a duplicate gesture was canceled.
     */
    #cancelDuplicateGesture() {
        if (!this.#duplicateGesture) {
            return false;
        }

        this.#suppressCommit = true;
        this.#transformStart = null;
        this.#duplicateActive = false;
        this.#duplicateGesture = false;
        this.gizmo?.detach();
        let source = null;
        try {
            source = this.#onDuplicateCancel();
        } finally {
            this.#entity = source;
            this.#attach();
            this.#suppressCommit = false;
        }
        this.#pointerId = null;
        this.#navigationGesture = false;
        if (this.gizmo) {
            this.gizmo.mouseButtons[0] = true;
        }
        this.#onPointerActivity(false);
        return true;
    }

    #applySnap() {
        for (const [tool, gizmo] of Object.entries(this.#gizmos)) {
            gizmo.snap = this.#snap.enabled;
            gizmo.snapIncrement = this.#snap[`${tool}Increment`];
        }
    }

    #notifyTransform() {
        const transform = this.#getTransform();
        if (transform) {
            this.#onTransformChange(transform);
        }
    }

    #commitTransform() {
        const before = this.#transformStart;
        const after = this.#getTransform();
        const duplicate = this.#duplicateActive;
        this.#transformStart = null;
        this.#duplicateActive = false;
        this.#onPointerActivity(false);
        if (this.#suppressCommit) {
            return;
        }

        if (duplicate && (!before || !after || this.#sameTransform(before, after))) {
            this.#duplicateGesture = false;
            const source = this.#onDuplicateCancel();
            if (source) {
                this.#entity = source;
                this.gizmo?.attach([source]);
            }
            return;
        }

        if (before && after) {
            const operation = this.#tool === 'translate' ? 'Move' : this.#tool === 'rotate' ? 'Rotate' : 'Scale';
            const prefix = duplicate ? 'Duplicate ' : '';
            const label = `${prefix}${operation} ${this.#entity?.name ?? 'Entity'}`;
            const committed = this.#onTransformCommit(before, after, label, duplicate);
            if (duplicate && committed === false) {
                const source = this.#onDuplicateCancel();
                if (source) {
                    this.#entity = source;
                    this.gizmo?.attach([source]);
                }
            }
        }
        this.#duplicateGesture = false;
    }

    /**
     * @param {Transform} first - Original transform.
     * @param {Transform} second - Candidate transform.
     * @returns {boolean} Whether both transforms are equal.
     */
    #sameTransform(first, second) {
        return ['position', 'rotation', 'scale'].every((field) => {
            return first[field].every((value, index) => value === second[field][index]);
        });
    }

    /**
     * @returns {Transform | null} Current selected entity transform.
     */
    #getTransform() {
        if (!this.#entity) {
            return null;
        }
        return {
            position: this.#entity.getLocalPosition().toArray(),
            rotation: unrealRotationToEuler(this.#entity.getLocalRotation()).toArray(),
            scale: this.#entity.getLocalScale().toArray()
        };
    }

    destroy() {
        this.#canvas.removeEventListener('pointerdown', this.#onPointerDown, true);
        this.#canvas.removeEventListener('pointermove', this.#onPointerState, true);
        this.#canvas.removeEventListener('mousedown', this.#onPointerState, true);
        window.removeEventListener('mouseup', this.#onPointerState, true);
        this.#canvas.removeEventListener('pointercancel', this.#onCancel);
        this.#canvas.removeEventListener('lostpointercapture', this.#onCancel);
        window.removeEventListener('blur', this.#onCancel);
        this.#onPointerActivity(false);
        for (const gizmo of Object.values(this.#gizmos)) {
            gizmo.destroy();
        }
    }
}
