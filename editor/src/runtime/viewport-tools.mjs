import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs';
import { Grid } from 'playcanvas/scripts/esm/grid.mjs';
import { BoundingBox, Color, Layer, OutlineRenderer, Vec3, Vec4, ViewCube } from 'playcanvas';

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

    /**
     * @param {AppBase} app - PlayCanvas app.
     * @param {Entity} cameraEntity - Viewport camera entity.
     * @param {HTMLCanvasElement} canvas - Viewport canvas.
     * @param {import('./transform-controller.mjs').TransformController} transformController - Gizmo controller.
     */
    constructor(app, cameraEntity, canvas, transformController) {
        this.#app = app;
        this.#cameraEntity = cameraEntity;
        this.#camera = cameraEntity.camera;
        this.#canvas = canvas;
        this.#transformController = transformController;

        this.#cameraControls = /** @type {CameraControls} */ (cameraEntity.script.create(CameraControls));
        Object.assign(this.#cameraControls, {
            focusPoint: Vec3.ZERO,
            rotateDamping: 0,
            moveDamping: 0
        });

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

    destroy() {
        this.#resizeObserver.disconnect();
        this.#viewCube.destroy();
        this.#outlineRenderer.destroy();
    }
}
