/**
 * @import { RuntimeEvent, SceneSnapshot, Transform, TransformTool, CoordinateSpace, HistorySnapshot, SnapSettings } from '../contracts/editor-contracts.mjs'
 */

/** @type {HistorySnapshot} */
export const emptyHistory = {
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null
};

/** @type {SnapSettings} */
export const defaultSnapSettings = {
    enabled: false,
    translateIncrement: 1,
    rotateIncrement: 5,
    scaleIncrement: 1
};

/**
 * @typedef {object} EditorState
 * @property {'loading'|'ready'|'error'} runtimeStatus - Runtime lifecycle state.
 * @property {SceneSnapshot} scene - Serializable scene snapshot.
 * @property {string | null} selectedEntityId - Currently selected entity identity.
 * @property {TransformTool} activeTool - Active transform operation.
 * @property {CoordinateSpace} coordinateSpace - Requested transform axis space.
 * @property {HistorySnapshot} history - Transform history availability.
 * @property {SnapSettings} snap - Gizmo snapping preferences.
 * @property {string} statusMessage - Short runtime feedback for the status bar.
 * @property {string | null} error - Runtime initialization error.
 */

/** @type {EditorState} */
export const initialEditorState = {
    runtimeStatus: 'loading',
    scene: { entities: [] },
    selectedEntityId: null,
    activeTool: 'select',
    coordinateSpace: 'world',
    history: emptyHistory,
    snap: defaultSnapSettings,
    statusMessage: '正在初始化本地编辑器…',
    error: null
};

/**
 * Applies an observation emitted by the graphics runtime to the editor's plain-data state.
 *
 * @param {EditorState} state - Current editor state.
 * @param {RuntimeEvent} event - Runtime observation.
 * @returns {EditorState} New editor state.
 */
export const editorReducer = (state, event) => {
    switch (event.type) {
        case 'ready':
            return {
                ...state,
                runtimeStatus: 'ready',
                scene: event.scene,
                history: event.history,
                snap: event.snap,
                statusMessage: 'Viewport ready',
                error: null
            };
        case 'sceneChanged':
            return {
                ...state,
                scene: event.scene
            };
        case 'selectionChanged':
            return {
                ...state,
                selectedEntityId: event.entityId
            };
        case 'transformChanged':
            return {
                ...state,
                scene: {
                    entities: state.scene.entities.map((entity) => {
                        return entity.id === event.entityId ? {
                            ...entity,
                            transform: event.transform
                        } : entity;
                    })
                }
            };
        case 'historyChanged':
            return {
                ...state,
                history: event.history
            };
        case 'snapChanged':
            return {
                ...state,
                snap: event.snap
            };
        case 'statusChanged':
            return {
                ...state,
                statusMessage: event.message
            };
        case 'runtimeError':
            return {
                ...state,
                runtimeStatus: 'error',
                error: event.message,
                statusMessage: 'Runtime error'
            };
        default:
            return state;
    }
};

/**
 * @param {EditorState} state - Current editor state.
 * @returns {import('../contracts/editor-contracts.mjs').EntitySnapshot | null} Selected entity data.
 */
export const getSelectedEntity = (state) => {
    return state.scene.entities.find(entity => entity.id === state.selectedEntityId) ?? null;
};

/**
 * @param {number[]} value - Candidate vector.
 * @returns {boolean} Whether the value is a finite XYZ vector.
 */
export const isFiniteVector3 = (value) => {
    return Array.isArray(value) && value.length === 3 && value.every(component => Number.isFinite(component));
};
