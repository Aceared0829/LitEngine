import { Grid } from 'playcanvas/scripts/esm/grid.mjs';
import { BoundingBox, Color, Layer, Mat4, OutlineRenderer, Vec3, Vec4, ViewCube } from 'playcanvas';

import { ViewportCameraControls } from './viewport-camera-controls.mjs';

/**
 * @import { AppBase, Entity } from 'playcanvas'
 */

const FRAME_MARGIN = 1.35;
const MIN_FRAME_DISTANCE = 2;
const tmpBounds = new BoundingBox();
const tmpPosition = new Vec3();
const tmpDirection = new Vec3();
const tmpViewInverse = new Mat4();

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

    /** @type {ViewportCameraControls} */
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
        this.#cameraControls = new ViewportCameraControls(app, cameraEntity, canvas, onNavigationChange, onFlySpeedChange);

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
        app.on('prerender', () => {
            this.#camera.camera.getViewInverseMatrix(cameraEntity.getWorldTransform(), tmpViewInverse);
            this.#viewCube.update(tmpViewInverse);
        });

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
            this.#cameraControls.setPivot(entity.getPosition());
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
     * @param {number} speed - Requested camera movement speed.
     */
    setFlySpeed(speed) {
        this.#cameraControls.setFlySpeed(speed);
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
        this.#app.updateCanvasSize();
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
        const grid = entity.script.create(Grid);
        grid.colorZ = new Color(0.3, 1, 0.3);
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
            for (const render of entity.findComponents('render')) {
                for (const meshInstance of render.meshInstances ?? []) {
                    if (!hasBounds) {
                        tmpBounds.copy(meshInstance.aabb);
                        hasBounds = true;
                    } else {
                        tmpBounds.add(meshInstance.aabb);
                    }
                }
            }
        }

        const center = hasBounds ? tmpBounds.center : fallback;
        if (!center) {
            return false;
        }

        const radius = hasBounds ? Math.max(tmpBounds.halfExtents.length(), 0.5) : 1;
        const halfFov = this.#camera.fov * Math.PI / 360;
        const verticalHalfFov = this.#camera.horizontalFov ? Math.atan(Math.tan(halfFov) / this.#camera.aspectRatio) : halfFov;
        const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * this.#camera.aspectRatio);
        const distance = Math.max(
            MIN_FRAME_DISTANCE,
            radius * FRAME_MARGIN / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov))
        );
        tmpDirection.copy(this.#cameraEntity.forward).mulScalar(-1);
        tmpPosition.copy(tmpDirection).mulScalar(distance).add(center);
        this.#cameraControls.reset(center, tmpPosition);
        return true;
    }

    destroy() {
        this.#cameraControls.destroy();
        this.#resizeObserver.disconnect();
        this.#viewCube.destroy();
        this.#outlineRenderer.destroy();
    }
}
