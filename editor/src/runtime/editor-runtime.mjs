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
    Vec3,
    unrealEulerToRotation,
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
 * @typedef {object} DuplicateTransformContext
 * @property {string} entityId - Copy identity.
 * @property {string} sourceEntityId - Source identity selected before duplication.
 * @property {Entity} entity - Cloned entity retained by history.
 * @property {Entity} parent - Parent used to restore the clone on redo.
 * @property {Transform} initialTransform - Transform at the beginning of the drag.
 * @property {boolean} enabled - Whether the source entity was enabled.
 * @property {boolean} published - Whether the provisional copy is visible to the editor UI.
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

    /** @type {{ entityId: string, gestureId: number, before: Transform } | null} */
    #transformDrag = null;

    /** @type {DuplicateTransformContext | null} */
    #duplicateTransform = null;

    #lastGestureId = 0;

    #nextDuplicateId = 0;

    /** @type {Set<string>} */
    #duplicateEntityIds = new Set();

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

    /** @type {object} */
    #graphicsDeviceOptions;

    /** @type {Map<string, Transform>} */
    #initialTransforms = new Map();

    /**
     * @param {HTMLCanvasElement} canvas - Canvas supplied by the shell.
     * @param {(event: RuntimeEvent) => void} emit - Outbound runtime event emitter.
     * @param {object} [graphicsDeviceOptions] - Optional graphics backend selection for renderer tests.
     */
    constructor(canvas, emit, graphicsDeviceOptions = {}) {
        this.#canvas = canvas;
        this.#emit = emit;
        this.#graphicsDeviceOptions = graphicsDeviceOptions;
    }

    /**
     * Creates the editor scene and associated viewport tooling.
     *
     * @returns {Promise<void>} Completion promise.
     */
    async initialize() {
        try {
            const device = await createGraphicsDevice(this.#canvas, this.#graphicsDeviceOptions);
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
            app.coordinateSystem = 'unreal';
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
                        this.#cancelTransformDrag();
                        this.#selectionController?.invalidatePendingSelection();
                    }
                    this.#viewportTools?.setCameraControlEnabled(!active);
                },
                (transform) => {
                    this.#publishDuplicateTransform();
                    this.#emitTransformPreview(transform);
                },
                (before, after, label, duplicate) => {
                    if (duplicate) {
                        return this.#commitDuplicateTransform(before, after, label);
                    }
                    this.#commitTransform(this.#selectedEntityId, before, after, label);
                },
                () => this.#beginDuplicateTransform(),
                () => this.#cancelDuplicateTransform()
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
                this.#transformController?.cancelActiveGesture();
                this.#cancelTransformDrag();
                this.#selectionController?.invalidatePendingSelection();
                this.#selectById(command.entityId);
                break;
            case 'setTransform':
                this.#cancelTransformDrag();
                this.#setTransform(command.entityId, command.transform, command.label ?? 'Edit Transform');
                break;
            case 'beginTransformDrag':
                this.#beginTransformDrag(command.entityId, command.gestureId);
                break;
            case 'previewTransformDrag':
                this.#previewTransformDrag(command.entityId, command.gestureId, command.field, command.index, command.value);
                break;
            case 'endTransformDrag':
                this.#endTransformDrag(command.entityId, command.gestureId, command.label);
                break;
            case 'cancelTransformDrag':
                if (this.#isCurrentTransformDrag(command.entityId, command.gestureId)) {
                    this.#cancelTransformDrag();
                }
                break;
            case 'resetTransformField':
                this.#cancelTransformDrag();
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
                this.#transformController?.cancelActiveGesture();
                this.#cancelTransformDrag();
                this.#undo();
                break;
            case 'redo':
                this.#transformController?.cancelActiveGesture();
                this.#cancelTransformDrag();
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
        camera.coordinateSystem = 'unreal';
        camera.addComponent('script');
        camera.addComponent('camera', {
            clearColor: new Color(0.07, 0.08, 0.1),
            farClip: 1000,
            coordinateSystem: 'unreal'
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
            entity.coordinateSystem = 'unreal';
            entity.addComponent('render', { type, material: createMaterial(color) });
            entity.setLocalPosition(...position);
            entity.setLocalScale(...scale);
            app.root.addChild(entity);
            this.#scene.register(entity, id);
            this.#setInitialTransform(id);
        };

        createPrimitive('box', 'Box', 'box', [1, 1, 0.5], new Color(0.35, 0.82, 1));
        createPrimitive('sphere', 'Sphere', 'sphere', [1, -1, 0.5], new Color(1, 0.48, 0.82));
        createPrimitive('cone', 'Cone', 'cone', [-1, -1, 1.125], new Color(1, 0.82, 0.35), [1.5, 1.5, 2.25]);
        createPrimitive('capsule', 'Capsule', 'capsule', [-1, 1, 1], new Color(0.53, 0.58, 1));

        const grid = new Entity('Grid');
        grid.coordinateSystem = 'unreal';
        grid.setLocalEulerAngles(90, 0, 0);
        grid.setLocalScale(8, 1, 8);
        app.root.addChild(grid);
        ViewportTools.addGrid(grid);

        const light = new Entity('Directional Light');
        light.coordinateSystem = 'unreal';
        light.addComponent('light', { intensity: 1 });
        light.setRotation(unrealEulerToRotation(new Vec3(0, -60, 0)));
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
        const selectedEntry = this.#scene.snapshot().entities.find((snapshot) => {
            const candidate = this.#scene.getEntity(snapshot.id);
            for (let node = entity; node; node = node.parent) {
                if (node === candidate) {
                    return true;
                }
            }
            return false;
        });
        this.#selectById(selectedEntry?.id ?? null);
    }

    /**
     * @param {string | null} entityId - ID to select.
     */
    #selectById(entityId) {
        this.#cancelTransformDrag();
        this.#viewportTools?.select(this.#scene.getEntity(entityId));
        this.#selectedEntityId = entityId;
        this.#emit({ type: 'selectionChanged', entityId });
        this.#emit({ type: 'statusChanged', message: entityId ? `Selected ${this.#scene.getEntity(entityId)?.name ?? 'Entity'}` : 'Selection cleared' });
    }

    /**
     * Creates a provisional copy for an Alt-drag gesture and makes it the active selection.
     *
     * @returns {Entity | null} The copy to attach to the active transform gizmo.
     */
    #beginDuplicateTransform() {
        const sourceEntityId = this.#selectedEntityId;
        const source = this.#scene.getEntity(sourceEntityId);
        if (!source || this.#duplicateTransform) {
            return null;
        }

        const scene = this.#scene.snapshot();
        const names = new Set(scene.entities.map(entity => entity.name));
        const baseName = `${source.name} Copy`;
        let name = baseName;
        let suffix = 2;
        while (names.has(name)) {
            name = `${baseName} ${suffix++}`;
        }

        let entityId;
        do {
            entityId = `${sourceEntityId}-copy-${++this.#nextDuplicateId}`;
        } while (this.#scene.getEntity(entityId));

        const duplicate = this.#scene.duplicate(sourceEntityId, entityId, name);
        if (!duplicate) {
            return null;
        }

        this.#duplicateTransform = {
            entityId,
            sourceEntityId,
            entity: duplicate.entity,
            parent: duplicate.parent,
            initialTransform: duplicate.initialTransform,
            enabled: duplicate.enabled,
            published: false
        };
        this.#duplicateEntityIds.add(entityId);
        this.#initialTransforms.set(entityId, duplicate.initialTransform);
        this.#selectedEntityId = entityId;
        return duplicate.entity;
    }

    /**
     * Publishes a provisional copy only after the gizmo reports a real transform movement.
     */
    #publishDuplicateTransform() {
        const duplicate = this.#duplicateTransform;
        if (!duplicate || duplicate.published) {
            return;
        }

        duplicate.entity.enabled = duplicate.enabled;
        duplicate.published = true;
        this.#viewportTools?.select(duplicate.entity, false);
        this.#emit({ type: 'sceneChanged', scene: this.#scene.snapshot() });
        this.#emit({ type: 'selectionChanged', entityId: duplicate.entityId });
        this.#emit({ type: 'statusChanged', message: `Selected ${duplicate.entity.name}` });
    }

    /**
     * Removes an uncommitted copy and restores the source selection.
     *
     * @returns {Entity | null} Source entity to reattach to the active gizmo.
     */
    #cancelDuplicateTransform() {
        const duplicate = this.#duplicateTransform;
        if (!duplicate) {
            return null;
        }

        this.#duplicateTransform = null;
        const entity = this.#scene.remove(duplicate.entityId);
        this.#initialTransforms.delete(duplicate.entityId);
        this.#duplicateEntityIds.delete(duplicate.entityId);
        entity?.destroy();
        const source = this.#scene.getEntity(duplicate.sourceEntityId);
        this.#selectedEntityId = duplicate.sourceEntityId;
        if (duplicate.published) {
            this.#viewportTools?.select(source, false);
            this.#emit({ type: 'sceneChanged', scene: this.#scene.snapshot() });
            this.#emit({ type: 'selectionChanged', entityId: duplicate.sourceEntityId });
            this.#emit({ type: 'statusChanged', message: `Selected ${source?.name ?? 'Entity'}` });
        }
        return source;
    }

    /**
     * Commits a successful copy-and-transform as one undoable operation.
     *
     * @param {Transform} before - Copy transform at drag start.
     * @param {Transform} after - Copy transform at drag end.
     * @param {string} label - History label.
     * @returns {boolean} Whether the duplicate was committed.
     */
    #commitDuplicateTransform(before, after, label) {
        const duplicate = this.#duplicateTransform;
        if (!duplicate) {
            return false;
        }

        this.#publishDuplicateTransform();
        const committed = this.#history.commit({
            type: 'duplicate',
            entityId: duplicate.entityId,
            sourceEntityId: duplicate.sourceEntityId,
            entity: duplicate.entity,
            parent: duplicate.parent,
            initialTransform: duplicate.initialTransform,
            before,
            after,
            label
        });
        if (!committed) {
            return false;
        }

        this.#duplicateTransform = null;
        this.#emit({ type: 'sceneChanged', scene: this.#scene.snapshot() });
        this.#emitHistory();
        this.#emit({ type: 'statusChanged', message: label });
        return true;
    }

    /**
     * @param {string} entityId - Selected entity identity.
     * @param {number} gestureId - Pointer gesture identity.
     */
    #beginTransformDrag(entityId, gestureId) {
        if (this.#selectedEntityId !== entityId || !Number.isSafeInteger(gestureId) || gestureId <= this.#lastGestureId) {
            return;
        }
        this.#cancelTransformDrag();
        this.#lastGestureId = gestureId;
        const before = this.#scene.getTransform(entityId);
        if (before) {
            this.#transformDrag = { entityId, gestureId, before };
        }
    }

    /**
     * @param {string} entityId - Selected entity identity.
     * @param {number} gestureId - Pointer gesture identity.
     * @returns {boolean} Whether the pointer owns the current transaction.
     */
    #isCurrentTransformDrag(entityId, gestureId) {
        return this.#transformDrag?.entityId === entityId && this.#transformDrag.gestureId === gestureId &&
            this.#selectedEntityId === entityId;
    }

    /**
     * @param {string} entityId - Selected entity identity.
     * @param {number} gestureId - Pointer gesture identity.
     * @param {'position'|'rotation'|'scale'} field - Transform vector to edit.
     * @param {number} index - XYZ component index.
     * @param {number} value - Preview value.
     */
    #previewTransformDrag(entityId, gestureId, field, index, value) {
        if (!this.#isCurrentTransformDrag(entityId, gestureId) ||
            !['position', 'rotation', 'scale'].includes(field) || !Number.isInteger(index) || index < 0 || index > 2 ||
            !Number.isFinite(value)) {
            return;
        }
        const current = this.#scene.getTransform(entityId);
        if (!current) {
            return;
        }
        const vector = current[field].slice();
        vector[index] = value;
        const transform = { ...current, [field]: vector };
        if (!this.#isValidTransform(transform)) {
            return;
        }
        const after = this.#scene.setTransform(entityId, transform);
        if (after) {
            this.#emit({ type: 'transformChanged', entityId, transform: after });
        }
    }

    /**
     * @param {string} entityId - Selected entity identity.
     * @param {number} gestureId - Pointer gesture identity.
     * @param {string} label - History label.
     */
    #endTransformDrag(entityId, gestureId, label) {
        if (!this.#isCurrentTransformDrag(entityId, gestureId)) {
            return;
        }
        const before = this.#transformDrag.before;
        this.#transformDrag = null;
        const after = this.#scene.getTransform(entityId);
        if (after) {
            this.#commitTransform(entityId, before, after, label);
        }
    }

    #cancelTransformDrag() {
        const drag = this.#transformDrag;
        this.#transformDrag = null;
        if (drag) {
            const transform = this.#scene.setTransform(drag.entityId, drag.before);
            if (transform) {
                this.#emit({ type: 'transformChanged', entityId: drag.entityId, transform });
            }
        }
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

        if (entry.type === 'duplicate') {
            const entity = this.#scene.remove(entry.entityId);
            if (entity) {
                this.#initialTransforms.delete(entry.entityId);
                this.#emit({ type: 'sceneChanged', scene: this.#scene.snapshot() });
                this.#selectById(entry.sourceEntityId);
            }
        } else {
            const transform = this.#scene.setTransform(entry.entityId, entry.before);
            if (transform) {
                this.#emit({ type: 'transformChanged', entityId: entry.entityId, transform });
            }
        }
        this.#emitHistory();
        this.#emit({ type: 'statusChanged', message: `Undo ${entry.label}` });
    }

    #redo() {
        const entry = this.#history.redo();
        if (!entry) {
            return;
        }

        if (entry.type === 'duplicate') {
            if (this.#scene.restore(entry.entity, entry.entityId, entry.parent, entry.initialTransform)) {
                this.#initialTransforms.set(entry.entityId, entry.initialTransform);
                this.#scene.setTransform(entry.entityId, entry.after);
                this.#emit({ type: 'sceneChanged', scene: this.#scene.snapshot() });
                this.#selectById(entry.entityId);
            }
        } else {
            const transform = this.#scene.setTransform(entry.entityId, entry.after);
            if (transform) {
                this.#emit({ type: 'transformChanged', entityId: entry.entityId, transform });
            }
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
        this.#transformController?.cancelActiveGesture();
        this.#cancelTransformDrag();
        this.#selectionController?.invalidatePendingSelection();
        this.#history.clear();
        for (const entityId of this.#duplicateEntityIds) {
            const entity = this.#scene.remove(entityId);
            entity?.destroy();
            this.#initialTransforms.delete(entityId);
        }
        this.#duplicateEntityIds.clear();
        for (const [id, transform] of this.#initialTransforms) {
            this.#scene.setTransform(id, transform);
        }
        this.#emit({ type: 'sceneChanged', scene: this.#scene.snapshot() });
        this.#emitHistory();
        this.#selectById('box');
        this.#emit({ type: 'statusChanged', message: 'Scene reset' });
    }

    destroy() {
        this.#transformController?.cancelActiveGesture();
        this.#cancelTransformDrag();
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
