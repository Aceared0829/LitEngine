import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs';
import { Grid } from 'playcanvas/scripts/esm/grid.mjs';
import { BoundingBox, Color, Layer, OutlineRenderer, Vec3, Vec4, ViewCube } from 'playcanvas';

import { adjustFlySpeed, getFlySpeedRatios, getWheelSteps, setFlySpeed } from './fly-speed.mjs';

/**
 * @import { AppBase, Entity } from 'playcanvas'
 */

const FRAME_MARGIN = 1.35;
const MIN_FRAME_DISTANCE = 2;
const tmpBounds = new BoundingBox();
const tmpPosition = new Vec3();
const tmpDirection = new Vec3();

/**
 * Owns viewport-only rendering and camera interaction helpers.
 */
export class ViewportTools {
    /** @type {AppBase} */
    #app;

    /** @type {import('playcanvas').CameraComponent} */
    #camera;

    /** @type {Entity} */
    #cameraEntity;

    /** @type {CameraControls} */
    #cameraControls;

    /** @type {OutlineRenderer} */
    #outlineRenderer;

    /** @type {ViewCube} */
    #viewCube;

    /** @type {ResizeObserver} */
    #resizeObserver;

    /** @type {HTMLCanvasElement} */
    #canvas;

    /** @type {import('./transform-controller.mjs').TransformController} */
    #transformController;

    /** @type {(active: boolean) => void} */
    #onNavigationChange;

    /** @type {(speed: number) => void} */
    #onFlySpeedChange;

    /** @type {{ fast: number, slow: number }} */
    #flySpeedRatios;

    #flySpeed;

    /** @type {(event: PointerEvent) => void} */
    #onPointerDown;

    /** @type {(event: PointerEvent) => void} */
    #onPointerUp;

    /** @type {(event: WheelEvent) => void} */
    #onWheel;

    /** @type {() => void} */
    #onWindowBlur;

    /**
     * @param {AppBase} app - PlayCanvas app.
     * @param {Entity} cameraEntity - Viewport camera entity.
     * @param {HTMLCanvasElement} canvas - Viewport canvas.
     * @param {import('./transform-controller.mjs').TransformController} transformController - Gizmo controller.
     * @param {(active: boolean) => void} onNavigationChange - Reports RMB navigation state.
     * @param {(speed: number) => void} onFlySpeedChange - Reports editor fly speed adjustments.
     */
    constructor(app, cameraEntity, canvas, transformController, onNavigationChange, onFlySpeedChange) {
        this.#app = app;
        this.#cameraEntity = cameraEntity;
        this.#camera = cameraEntity.camera;
        this.#canvas = canvas;
        this.#transformController = transformController;
        this.#onNavigationChange = onNavigationChange;
        this.#onFlySpeedChange = onFlySpeedChange;

        this.#cameraControls = /** @type {CameraControls} */ (cameraEntity.script.create(CameraControls));
        Object.assign(this.#cameraControls, {
            focusPoint: Vec3.ZERO,
            rotateDamping: 0,
            moveDamping: 0
        });
        this.#cameraControls.enableFly = false;
        this.#flySpeed = this.#cameraControls.moveSpeed;
        this.#flySpeedRatios = getFlySpeedRatios(this.#cameraControls);

        this.#onPointerDown = (event) => {
            if (event.button !== 2) {
                return;
            }
            this.#cameraControls.enableFly = true;
            this.#onNavigationChange(true);
        };
        this.#onPointerUp = (event) => {
            if (event.button !== 2) {
                return;
            }
            this.#endNavigation();
        };
        this.#onWheel = (event) => {
            if (!(event.buttons & 2)) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
            this.#flySpeed = adjustFlySpeed(this.#flySpeed, getWheelSteps(event));
            setFlySpeed(this.#cameraControls, this.#flySpeed, this.#flySpeedRatios);
            this.#onFlySpeedChange(this.#flySpeed);
        };
        this.#onWindowBlur = () => this.#endNavigation();
        canvas.addEventListener('pointerdown', this.#onPointerDown, true);
        window.addEventListener('pointerup', this.#onPointerUp, true);
        canvas.addEventListener('wheel', this.#onWheel, { capture: true, passive: false });
        window.addEventListener('blur', this.#onWindowBlur);

        const outlineLayer = new Layer({ name: 'EditorOutline' });
        app.scene.layers.push(outlineLayer);
        const immediateLayer = /** @type {Layer} */ (app.scene.layers.getLayerByName('Immediate'));
        this.#outlineRenderer = new OutlineRenderer(app, outlineLayer);
        app.on('update', () => this.#outlineRenderer.frameUpdate(cameraEntity, immediateLayer, false));

        this.#viewCube = new ViewCube(new Vec4(0, 1, 1, 0));
        this.#viewCube.dom.classList.add('editor-view-cube');
        canvas.parentElement?.appendChild(this.#viewCube.dom);
        this.#viewCube.on(ViewCube.EVENT_CAMERAALIGN, (direction) => {
            const cameraPosition = cameraEntity.getPosition();
            const target = this.#cameraControls.focusPoint;
            const distance = target.distance(cameraPosition);
            const start = direction.clone().mulScalar(distance).add(target);
            this.#cameraControls.reset(target, start);
        });
        app.on('prerender', () => this.#viewCube.update(cameraEntity.getWorldTransform()));

        this.#resizeObserver = new ResizeObserver(() => this.resize());
        this.#resizeObserver.observe(canvas);
        this.resize();
    }

    /**
     * @param {Entity | null} entity - Selected entity.
     */
    select(entity) {
        this.#outlineRenderer.removeAllEntities();
        if (entity) {
            this.#outlineRenderer.addEntity(entity, Color.WHITE);
        }
        this.#transformController.select(entity);
    }

    /**
     * @param {boolean} enabled - Camera control enabled state.
     */
    setCameraControlEnabled(enabled) {
        this.#cameraControls.enabled = enabled;
    }

    /**
     * Frames a selected entity's render bounds, or its world position if it has no mesh.
     *
     * @param {Entity | null} entity - Entity to frame.
     * @returns {boolean} Whether a target was available.
     */
    focusSelected(entity) {
        return entity ? this.#frameEntities([entity]) : false;
    }

    /**
     * Frames all supplied scene entities.
     *
     * @param {Entity[]} entities - Entities to frame.
     * @returns {boolean} Whether a target was available.
     */
    frameAll(entities) {
        return this.#frameEntities(entities);
    }

    /**
     * Recalculates the canvas resolution and apparent gizmo size.
     */
    resize() {
        this.#app.resizeCanvas();
        const bounds = this.#canvas.getBoundingClientRect();
        const dimension = this.#camera.horizontalFov ? bounds.width : bounds.height;
        if (dimension > 0 && this.#transformController.gizmo) {
            this.#transformController.gizmo.size = 1024 / dimension;
        }
    }

    /**
     * Adds the editor floor grid to the supplied entity.
     *
     * @param {Entity} entity - Grid entity.
     */
    static addGrid(entity) {
        entity.addComponent('script');
        entity.script.create(Grid);
    }

    /**
     * @param {Entity[]} entities - Entities to frame.
     * @returns {boolean} Whether bounds or a fallback point were found.
     */
    #frameEntities(entities) {
        let hasBounds = false;
        let fallback = null;
        for (const entity of entities) {
            fallback ??= entity.getPosition();
            for (const meshInstance of entity.render?.meshInstances ?? []) {
                if (!hasBounds) {
                    tmpBounds.copy(meshInstance.aabb);
                    hasBounds = true;
                } else {
                    tmpBounds.add(meshInstance.aabb);
                }
            }
        }

        const center = hasBounds ? tmpBounds.center : fallback;
        if (!center) {
            return false;
        }

        const radius = hasBounds ? Math.max(tmpBounds.halfExtents.length(), 0.5) : 1;
        const verticalFov = this.#camera.horizontalFov ? this.#camera.fov / this.#camera.aspectRatio : this.#camera.fov;
        const distance = Math.max(
            MIN_FRAME_DISTANCE,
            radius * FRAME_MARGIN / Math.tan((verticalFov * Math.PI / 180) * 0.5)
        );
        tmpDirection.copy(this.#cameraEntity.getPosition()).sub(this.#cameraControls.focusPoint).normalize();
        tmpPosition.copy(tmpDirection).mulScalar(distance).add(center);
        this.#cameraControls.reset(center, tmpPosition);
        return true;
    }

    #endNavigation() {
        this.#cameraControls.enableFly = false;
        this.#onNavigationChange(false);
    }

    destroy() {
        this.#endNavigation();
        this.#canvas.removeEventListener('pointerdown', this.#onPointerDown, true);
        window.removeEventListener('pointerup', this.#onPointerUp, true);
        this.#canvas.removeEventListener('wheel', this.#onWheel, true);
        window.removeEventListener('blur', this.#onWindowBlur);
        this.#resizeObserver.disconnect();
        this.#viewCube.destroy();
        this.#outlineRenderer.destroy();
    }
}
