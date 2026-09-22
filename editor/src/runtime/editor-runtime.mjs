import {
    AppBase,
    AppOptions,
    CameraComponentSystem,
    Color,
    Entity,
    LightComponentSystem,
    RenderComponentSystem,
    RESOLUTION_AUTO,
    ScriptComponentSystem,
    StandardMaterial,
    createGraphicsDevice
} from 'playcanvas';

import { isFiniteVector3 } from '../domain/editor-reducer.mjs';
import { SceneAdapter } from './scene-adapter.mjs';
import { SelectionController } from './selection-controller.mjs';
import { TransformController } from './transform-controller.mjs';
import { TransformHistory } from './transform-history.mjs';
import { ViewportTools } from './viewport-tools.mjs';

/**
 * @import { EditorCommand, RuntimeEvent, Transform } from '../contracts/editor-contracts.mjs'
 */

/**
 * Sole PlayCanvas owner for the editor. It realizes commands using private engine objects,
 * then communicates observations as plain data.
 */
export class EditorRuntime {
    /** @type {HTMLCanvasElement} */
    #canvas;

    /** @type {(event: RuntimeEvent) => void} */
    #emit;

    /** @type {AppBase | null} */
    #app = null;

    #destroyed = false;

    #scene = new SceneAdapter();

    #history = new TransformHistory();

    /** @type {TransformController | null} */
    #transformController = null;

    /** @type {SelectionController | null} */
    #selectionController = null;

    /** @type {ViewportTools | null} */
    #viewportTools = null;

    /** @type {string | null} */
    #selectedEntityId = null;

    /** @type {boolean} */
    #gizmoActive = false;

    /** @type {Map<string, Transform>} */
    #initialTransforms = new Map();

    /**
     * @param {HTMLCanvasElement} canvas - Canvas supplied by the shell.
     * @param {(event: RuntimeEvent) => void} emit - Outbound runtime event emitter.
     */
    constructor(canvas, emit) {
        this.#canvas = canvas;
        this.#emit = emit;
    }

    /**
     * Creates the editor scene and associated viewport tooling.
     *
     * @returns {Promise<void>} Completion promise.
     */
    async initialize() {
        try {
            const device = await createGraphicsDevice(this.#canvas);
            if (this.#destroyed) {
                device.destroy();
                return;
            }
            device.maxPixelRatio = Math.min(window.devicePixelRatio, 2);

            const options = new AppOptions();
            options.graphicsDevice = device;
            options.componentSystems = [
                RenderComponentSystem,
                CameraComponentSystem,
                LightComponentSystem,
                ScriptComponentSystem
            ];

            const app = new AppBase(this.#canvas);
            app.init(options);
            app.setCanvasResolution(RESOLUTION_AUTO);
            app.scene.ambientLight = new Color(0.2, 0.2, 0.2);
            this.#app = app;

            const camera = this.#createCamera(app);
            this.#createSceneEntities(app);

            this.#transformController = new TransformController(
                camera.camera,
                (active) => {
                    this.#gizmoActive = active;
                    if (active) {
                        this.#selectionController?.invalidatePendingSelection();
                    }
                    this.#viewportTools?.setCameraControlEnabled(!active);
                },
                transform => this.#emitTransformPreview(transform),
                (before, after, label) => this.#commitTransform(this.#selectedEntityId, before, after, label)
            );
            this.#viewportTools = new ViewportTools(
                app,
                camera,
                this.#canvas,
                this.#transformController,
                (active) => {
                    if (active) {
                        this.#selectionController?.invalidatePendingSelection();
                    }
                    this.#emit({ type: 'viewportNavigationChanged', active });
                },
                (speed) => {
                    this.#emit({ type: 'flySpeedChanged', speed });
                    this.#emit({ type: 'statusChanged', message: `Fly speed: ${speed.toFixed(1)}` });
                }
            );
            const worldLayer = app.scene.layers.getLayerByName('World');
            this.#selectionController = new SelectionController(
                this.#canvas,
                app,
                camera.camera,
                worldLayer ? [worldLayer] : [],
                entity => this.#selectRuntimeEntity(entity),
                () => this.#gizmoActive
            );

            app.start();
            this.#emit({
                type: 'ready',
                scene: this.#scene.snapshot(),
                history: this.#history.snapshot(),
                snap: this.#transformController.snap
            });
            this.#selectById('box');
        } catch (error) {
            if (this.#destroyed) {
                return;
            }
            this.#emit({
                type: 'runtimeError',
                message: error instanceof Error ? error.message : String(error)
            });
            this.destroy();
        }
    }

    /**
     * @param {EditorCommand} command - Intent from the controller.
     */
    dispatch(command) {
        switch (command.type) {
            case 'selectEntity':
                this.#selectionController?.invalidatePendingSelection();
                this.#selectById(command.entityId);
                break;
            case 'setTransform':
                this.#setTransform(command.entityId, command.transform, command.label ?? 'Edit Transform');
                break;
            case 'resetTransformField':
                this.#resetTransformField(command.entityId, command.field);
                break;
            case 'setTransformTool':
                this.#transformController?.setTool(command.tool);
                this.#viewportTools?.resize();
                this.#emit({ type: 'statusChanged', message: this.#toolStatus(command.tool) });
                break;
            case 'setCoordinateSpace':
                this.#transformController?.setCoordinateSpace(command.coordinateSpace);
                this.#emit({ type: 'statusChanged', message: `${command.coordinateSpace === 'world' ? 'World' : 'Local'} transform space` });
                break;
            case 'setSnapEnabled':
                this.#transformController?.setSnapEnabled(command.enabled);
                this.#emitSnap();
                this.#emit({ type: 'statusChanged', message: command.enabled ? 'Transform snapping enabled' : 'Transform snapping disabled' });
                break;
            case 'setSnapIncrement':
                this.#transformController?.setSnapIncrement(command.tool, command.increment);
                this.#emitSnap();
                break;
            case 'undo':
                this.#undo();
                break;
            case 'redo':
                this.#redo();
                break;
            case 'focusSelected':
                this.#focusSelected();
                break;
            case 'frameAll':
                this.#frameAll();
                break;
            case 'setFlySpeed':
                this.#viewportTools?.setFlySpeed(command.speed);
                break;
            case 'resetScene':
                this.#resetScene();
                break;
        }
    }

    /**
     * @param {AppBase} app - PlayCanvas app.
     * @returns {Entity} Created camera entity.
     */
    #createCamera(app) {
        const camera = new Entity('Editor Camera');
        camera.addComponent('script');
        camera.addComponent('camera', {
            clearColor: new Color(0.07, 0.08, 0.1),
            farClip: 1000
        });
        camera.setPosition(5, 5, 5);
        app.root.addChild(camera);
        return camera;
    }

    /**
     * @param {AppBase} app - PlayCanvas app.
     */
    #createSceneEntities(app) {
        const createMaterial = (color) => {
            const material = new StandardMaterial();
            material.diffuse = color;
            material.update();
            return material;
        };
        const createPrimitive = (id, name, type, position, color, scale = [1, 1, 1]) => {
            const entity = new Entity(name);
            entity.addComponent('render', { type, material: createMaterial(color) });
            entity.setLocalPosition(...position);
            entity.setLocalScale(...scale);
            app.root.addChild(entity);
            this.#scene.register(entity, id);
            this.#setInitialTransform(id);
        };

        createPrimitive('box', 'Box', 'box', [1, 0, 1], new Color(0.35, 0.82, 1));
        createPrimitive('sphere', 'Sphere', 'sphere', [-1, 0, 1], new Color(1, 0.48, 0.82));
        createPrimitive('cone', 'Cone', 'cone', [-1, 0, -1], new Color(1, 0.82, 0.35), [1.5, 2.25, 1.5]);
        createPrimitive('capsule', 'Capsule', 'capsule', [1, 0, -1], new Color(0.53, 0.58, 1));

        const grid = new Entity('Grid');
        grid.setLocalScale(8, 1, 8);
        app.root.addChild(grid);
        ViewportTools.addGrid(grid);

        const light = new Entity('Directional Light');
        light.addComponent('light', { intensity: 1 });
        light.setEulerAngles(0, 0, -60);
        app.root.addChild(light);
        this.#scene.register(light, 'light');
        this.#setInitialTransform('light');
    }

    /**
     * @param {string} id - Registered entity identity.
     */
    #setInitialTransform(id) {
        const transform = this.#scene.getTransform(id);
        if (transform) {
            this.#initialTransforms.set(id, transform);
            this.#scene.setInitialTransform(id, transform);
        }
    }

    /**
     * @param {Entity | null} entity - Runtime picked entity.
     */
    #selectRuntimeEntity(entity) {
        const selectedEntry = this.#scene.snapshot().entities.find(snapshot => this.#scene.getEntity(snapshot.id) === entity);
        this.#selectById(selectedEntry?.id ?? null);
    }

    /**
     * @param {string | null} entityId - ID to select.
     */
    #selectById(entityId) {
        this.#viewportTools?.select(this.#scene.getEntity(entityId));
        this.#selectedEntityId = entityId;
        this.#emit({ type: 'selectionChanged', entityId });
        this.#emit({ type: 'statusChanged', message: entityId ? `Selected ${this.#scene.getEntity(entityId)?.name ?? 'Entity'}` : 'Selection cleared' });
    }

    /**
     * @param {string} entityId - Entity identity.
     * @param {Transform} transform - Candidate local transform.
     * @param {string} label - History label.
     */
    #setTransform(entityId, transform, label) {
        if (!this.#isValidTransform(transform)) {
            return;
        }
        const before = this.#scene.getTransform(entityId);
        const after = this.#scene.setTransform(entityId, transform);
        if (before && after) {
            this.#emit({ type: 'transformChanged', entityId, transform: after });
            this.#commitTransform(entityId, before, after, label);
        }
    }

    /**
     * @param {string} entityId - Entity identity.
     * @param {'position'|'rotation'|'scale'} field - Transform field to restore.
     */
    #resetTransformField(entityId, field) {
        const current = this.#scene.getTransform(entityId);
        const initial = this.#scene.getInitialTransform(entityId);
        if (!current || !initial) {
            return;
        }
        this.#setTransform(entityId, { ...current, [field]: initial[field] }, `Reset ${field}`);
    }

    /**
     * @param {Transform} transform - Runtime transform emitted by a gizmo.
     */
    #emitTransformPreview(transform) {
        if (this.#selectedEntityId) {
            this.#emit({
                type: 'transformChanged',
                entityId: this.#selectedEntityId,
                transform
            });
        }
    }

    /**
     * @param {string | null} entityId - Edited entity identity.
     * @param {Transform} before - Transform before operation.
     * @param {Transform} after - Transform after operation.
     * @param {string} label - Operation label.
     */
    #commitTransform(entityId, before, after, label) {
        if (!entityId || !this.#history.commit({ entityId, before, after, label })) {
            return;
        }
        this.#emitHistory();
        this.#emit({ type: 'statusChanged', message: label });
    }

    #undo() {
        const entry = this.#history.undo();
        if (!entry) {
            return;
        }
        const transform = this.#scene.setTransform(entry.entityId, entry.before);
        if (transform) {
            this.#emit({ type: 'transformChanged', entityId: entry.entityId, transform });
        }
        this.#emitHistory();
        this.#emit({ type: 'statusChanged', message: `Undo ${entry.label}` });
    }

    #redo() {
        const entry = this.#history.redo();
        if (!entry) {
            return;
        }
        const transform = this.#scene.setTransform(entry.entityId, entry.after);
        if (transform) {
            this.#emit({ type: 'transformChanged', entityId: entry.entityId, transform });
        }
        this.#emitHistory();
        this.#emit({ type: 'statusChanged', message: `Redo ${entry.label}` });
    }

    #focusSelected() {
        const success = this.#viewportTools?.focusSelected(this.#scene.getEntity(this.#selectedEntityId));
        this.#emit({ type: 'statusChanged', message: success ? 'Framed selection' : 'Select an entity to frame' });
    }

    #frameAll() {
        const success = this.#viewportTools?.frameAll(this.#scene.getEntities());
        this.#emit({ type: 'statusChanged', message: success ? 'Framed scene' : 'Scene has no frameable entities' });
    }

    #emitHistory() {
        this.#emit({ type: 'historyChanged', history: this.#history.snapshot() });
    }

    #emitSnap() {
        if (this.#transformController) {
            this.#emit({ type: 'snapChanged', snap: this.#transformController.snap });
        }
    }

    /**
     * @param {TransformTool} tool - Tool to describe.
     * @returns {string} Status text.
     */
    #toolStatus(tool) {
        return tool === 'select' ? 'Select tool' : `${tool[0].toUpperCase()}${tool.slice(1)} tool`;
    }

    /**
     * @param {Transform} transform - Candidate transform.
     * @returns {boolean} Whether it can be safely applied.
     */
    #isValidTransform(transform) {
        return isFiniteVector3(transform.position) &&
            isFiniteVector3(transform.rotation) &&
            isFiniteVector3(transform.scale);
    }

    #resetScene() {
        this.#selectionController?.invalidatePendingSelection();
        for (const [id, transform] of this.#initialTransforms) {
            this.#scene.setTransform(id, transform);
        }
        this.#history.clear();
        this.#emit({ type: 'sceneChanged', scene: this.#scene.snapshot() });
        this.#emitHistory();
        this.#selectById('box');
        this.#emit({ type: 'statusChanged', message: 'Scene reset' });
    }

    destroy() {
        this.#destroyed = true;
        this.#selectionController?.destroy();
        this.#selectionController = null;
        this.#viewportTools?.destroy();
        this.#viewportTools = null;
        this.#transformController?.destroy();
        this.#transformController = null;
        this.#app?.destroy();
        this.#app = null;
    }
}
