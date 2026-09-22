/**
 * Serializable data shared between the UI/controller and the graphics runtime.
 * Neither side is allowed to exchange PlayCanvas objects.
 *
 * @typedef {'select'|'translate'|'rotate'|'scale'} TransformTool
 * @typedef {'world'|'local'} CoordinateSpace
 *
 * @typedef {object} Transform
 * @property {number[]} position - Local position XYZ.
 * @property {number[]} rotation - Local Euler rotation XYZ in degrees.
 * @property {number[]} scale - Local scale XYZ.
 *
 * @typedef {object} EntitySnapshot
 * @property {string} id - Stable editor entity identity.
 * @property {string} name - Display name.
 * @property {string} type - Read-only scene type.
 * @property {string[]} components - Read-only component names.
 * @property {Transform} transform - Local transform snapshot.
 * @property {Transform} initialTransform - Initial scene transform used by field reset.
 *
 * @typedef {object} SceneSnapshot
 * @property {EntitySnapshot[]} entities - Flat editable scene entries.
 *
 * @typedef {object} HistorySnapshot
 * @property {boolean} canUndo - Whether the runtime has a prior transform state.
 * @property {boolean} canRedo - Whether the runtime has an undone transform state.
 * @property {string | null} undoLabel - Description of the next undo operation.
 * @property {string | null} redoLabel - Description of the next redo operation.
 *
 * @typedef {object} SnapSettings
 * @property {boolean} enabled - Whether the active transform gizmo snaps.
 * @property {number} translateIncrement - Translation snap step.
 * @property {number} rotateIncrement - Rotation snap step in degrees.
 * @property {number} scaleIncrement - Scale drag snap step.
 *
 * @typedef {{ type: 'selectEntity', entityId: string | null }} SelectEntityCommand
 * @typedef {{ type: 'setTransform', entityId: string, transform: Transform, label?: string }} SetTransformCommand
 * @typedef {{ type: 'resetTransformField', entityId: string, field: 'position'|'rotation'|'scale' }} ResetTransformFieldCommand
 * @typedef {{ type: 'setTransformTool', tool: TransformTool }} SetTransformToolCommand
 * @typedef {{ type: 'setCoordinateSpace', coordinateSpace: CoordinateSpace }} SetCoordinateSpaceCommand
 * @typedef {{ type: 'setSnapEnabled', enabled: boolean }} SetSnapEnabledCommand
 * @typedef {{ type: 'setSnapIncrement', tool: Exclude<TransformTool, 'select'>, increment: number }} SetSnapIncrementCommand
 * @typedef {{ type: 'undo' }} UndoCommand
 * @typedef {{ type: 'redo' }} RedoCommand
 * @typedef {{ type: 'focusSelected' }} FocusSelectedCommand
 * @typedef {{ type: 'frameAll' }} FrameAllCommand
 * @typedef {{ type: 'setFlySpeed', speed: number }} SetFlySpeedCommand
 * @typedef {{ type: 'resetScene' }} ResetSceneCommand
 *
 * @typedef {SelectEntityCommand | SetTransformCommand | ResetTransformFieldCommand | SetTransformToolCommand | SetCoordinateSpaceCommand | SetSnapEnabledCommand | SetSnapIncrementCommand | UndoCommand | RedoCommand | FocusSelectedCommand | FrameAllCommand | SetFlySpeedCommand | ResetSceneCommand} EditorCommand
 *
 * @typedef {{ type: 'ready', scene: SceneSnapshot, history: HistorySnapshot, snap: SnapSettings }} ReadyEvent
 * @typedef {{ type: 'sceneChanged', scene: SceneSnapshot }} SceneChangedEvent
 * @typedef {{ type: 'selectionChanged', entityId: string | null }} SelectionChangedEvent
 * @typedef {{ type: 'transformChanged', entityId: string, transform: Transform }} TransformChangedEvent
 * @typedef {{ type: 'historyChanged', history: HistorySnapshot }} HistoryChangedEvent
 * @typedef {{ type: 'snapChanged', snap: SnapSettings }} SnapChangedEvent
 * @typedef {{ type: 'viewportNavigationChanged', active: boolean }} ViewportNavigationChangedEvent
 * @typedef {{ type: 'flySpeedChanged', speed: number }} FlySpeedChangedEvent
 * @typedef {{ type: 'statusChanged', message: string }} StatusChangedEvent
 * @typedef {{ type: 'runtimeError', message: string }} RuntimeErrorEvent
 *
 * @typedef {ReadyEvent | SceneChangedEvent | SelectionChangedEvent | TransformChangedEvent | HistoryChangedEvent | SnapChangedEvent | ViewportNavigationChangedEvent | FlySpeedChangedEvent | StatusChangedEvent | RuntimeErrorEvent} RuntimeEvent
 */

export {};
