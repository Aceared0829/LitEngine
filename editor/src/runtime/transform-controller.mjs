import {
    Gizmo,
    RotateGizmo,
    ScaleGizmo,
    TranslateGizmo
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

    /** @type {(before: Transform, after: Transform, label: string) => void} */
    #onTransformCommit;

    /** @type {Transform | null} */
    #transformStart = null;

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
     * @param {(before: Transform, after: Transform, label: string) => void} onTransformCommit - Reports committed gizmo drag.
     */
    constructor(camera, onPointerActivity, onTransformChange, onTransformCommit) {
        const layer = Gizmo.createLayer(camera.system.app);
        this.#onPointerActivity = onPointerActivity;
        this.#onTransformChange = onTransformChange;
        this.#onTransformCommit = onTransformCommit;
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
            });
            gizmo.on('transform:move', () => this.#notifyTransform());
            gizmo.on('transform:end', () => this.#commitTransform());
        }
        this.#applySnap();
    }

    /**
     * @param {TransformTool} tool - Tool to activate.
     */
    setTool(tool) {
        if (this.#tool === tool) {
            return;
        }

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

    #attach() {
        if (this.#entity && this.gizmo) {
            this.gizmo.attach([this.#entity]);
        }
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
        this.#transformStart = null;
        this.#onPointerActivity(false);
        if (before && after) {
            const label = `${this.#tool === 'translate' ? 'Move' : this.#tool === 'rotate' ? 'Rotate' : 'Scale'} ${this.#entity?.name ?? 'Entity'}`;
            this.#onTransformCommit(before, after, label);
        }
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
            rotation: this.#entity.getLocalEulerAngles().toArray(),
            scale: this.#entity.getLocalScale().toArray()
        };
    }

    destroy() {
        this.#onPointerActivity(false);
        for (const gizmo of Object.values(this.#gizmos)) {
            gizmo.destroy();
        }
    }
}
