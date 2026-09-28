/**
 * Browser-safe adapter for the intentionally narrow Electron preload bridge.
 * Renderer code imports this module instead of accessing Electron globals directly.
 */

/**
 * @typedef {'undo'|'redo'|'focusSelected'|'frameAll'} DesktopEditorCommand
 */

/**
 * @typedef {object} DesktopBridge
 * @property {(callback: (command: DesktopEditorCommand) => void) => () => void} onEditorCommand
 * @property {boolean} isDesktop
 * @property {() => void} closeWindow
 * @property {(id: 'hierarchy'|'inspector') => Promise<boolean>} openPanelWindow
 * @property {(request: object) => Promise<boolean>} openFloatingWindow
 * @property {(id: string) => void} focusFloatingWindow
 * @property {(id: string) => void} closeFloatingWindow
 * @property {(id: 'hierarchy'|'inspector') => void} focusPanelWindow
 * @property {(id: 'hierarchy'|'inspector') => void} closePanelWindow
 * @property {(state: import('../domain/editor-reducer.mjs').EditorState) => void} publishPanelState
 * @property {(command: import('../contracts/editor-contracts.mjs').EditorCommand) => void} sendPanelCommand
 * @property {(callback: (state: import('../domain/editor-reducer.mjs').EditorState) => void) => () => void} onPanelState
 * @property {() => void} requestPanelState
 * @property {(callback: (root: import('../shell/layout-preferences.mjs').LayoutNode) => void) => () => void} onFloatingLayout
 * @property {() => void} requestFloatingLayout
 * @property {(root: import('../shell/layout-preferences.mjs').LayoutNode) => void} publishFloatingLayout
 * @property {(callback: (id: string, root: import('../shell/layout-preferences.mjs').LayoutNode) => void) => () => void} onFloatingLayoutChanged
 * @property {(callback: (id: string, bounds: object) => void) => () => void} onFloatingBoundsChanged
 * @property {(callback: (id: string) => void) => () => void} onFloatingWindowClosed
 * @property {(callback: (command: import('../contracts/editor-contracts.mjs').EditorCommand) => void) => () => void} onPanelCommand
 * @property {(callback: (id: 'hierarchy'|'inspector') => void) => () => void} onPanelWindowClosed
 */

/**
 * @param {(command: { type: DesktopEditorCommand }) => void} callback - Handler for typed editor commands.
 * @returns {() => void} Unsubscribe callback.
 */
export const onDesktopEditorCommand = (callback) => {
    const bridge = /** @type {DesktopBridge | undefined} */ (globalThis.litEngineDesktop);
    return bridge?.onEditorCommand(type => callback({ type })) ?? (() => {});
};

/** @returns {boolean} Whether the renderer runs in the desktop editor. */
export const isDesktopEditor = () => Boolean(globalThis.litEngineDesktop?.isDesktop);

/** Closes the editor window from the File menu. */
export const closeDesktopWindow = () => globalThis.litEngineDesktop?.closeWindow();

/** @param {'hierarchy'|'inspector'} id - Tool panel to detach. */
export const openPanelWindow = async id => Boolean(await globalThis.litEngineDesktop?.openPanelWindow(id));

/** @param {object} request - Complete floating group and native screen position. */
export const openFloatingWindow = async request => Boolean(await globalThis.litEngineDesktop?.openFloatingWindow(request));

/** @param {string} id - Native floating group to focus. */
export const focusFloatingWindow = id => globalThis.litEngineDesktop?.focusFloatingWindow(id);

/** @param {string} id - Native floating group to close. */
export const closeFloatingWindow = id => globalThis.litEngineDesktop?.closeFloatingWindow(id);

/** @param {'hierarchy'|'inspector'} id - Tool panel to focus. */
export const focusPanelWindow = id => globalThis.litEngineDesktop?.focusPanelWindow(id);

/** @param {'hierarchy'|'inspector'} id - Tool window to close. */
export const closePanelWindow = id => globalThis.litEngineDesktop?.closePanelWindow(id);

/** @param {import('../domain/editor-reducer.mjs').EditorState} state - Shared editor snapshot. */
export const publishPanelState = state => globalThis.litEngineDesktop?.publishPanelState(state);

/** @param {import('../contracts/editor-contracts.mjs').EditorCommand} command - Tool panel intent. */
export const sendPanelCommand = command => globalThis.litEngineDesktop?.sendPanelCommand(command);

/** @param {(state: import('../domain/editor-reducer.mjs').EditorState) => void} callback - Shared state subscriber. */
export const onPanelState = callback => globalThis.litEngineDesktop?.onPanelState(callback) ?? (() => {});

/** Requests a fresh snapshot after a tool window has subscribed. */
export const requestPanelState = () => globalThis.litEngineDesktop?.requestPanelState();

/** @param {(root: import('../shell/layout-preferences.mjs').LayoutNode) => void} callback - Native group layout subscriber. */
export const onFloatingLayout = callback => globalThis.litEngineDesktop?.onFloatingLayout(callback) ?? (() => {});

/** Requests the native group's current panel tree. */
export const requestFloatingLayout = () => globalThis.litEngineDesktop?.requestFloatingLayout();

/** @param {import('../shell/layout-preferences.mjs').LayoutNode} root - Updated native group panel tree. */
export const publishFloatingLayout = root => globalThis.litEngineDesktop?.publishFloatingLayout(root);

/** @param {(id: string, root: import('../shell/layout-preferences.mjs').LayoutNode) => void} callback - Native group layout callback. */
export const onFloatingLayoutChanged = callback => globalThis.litEngineDesktop?.onFloatingLayoutChanged(callback) ?? (() => {});

/** @param {(id: string, bounds: object) => void} callback - Native group geometry callback. */
export const onFloatingBoundsChanged = callback => globalThis.litEngineDesktop?.onFloatingBoundsChanged(callback) ?? (() => {});

/** @param {(id: string) => void} callback - Native group close callback. */
export const onFloatingWindowClosed = callback => globalThis.litEngineDesktop?.onFloatingWindowClosed(callback) ?? (() => {});

/** @param {(command: import('../contracts/editor-contracts.mjs').EditorCommand) => void} callback - Tool panel intent subscriber. */
export const onPanelCommand = callback => globalThis.litEngineDesktop?.onPanelCommand(callback) ?? (() => {});

/** @param {(id: 'hierarchy'|'inspector') => void} callback - Native panel close subscriber. */
export const onPanelWindowClosed = callback => globalThis.litEngineDesktop?.onPanelWindowClosed(callback) ?? (() => {});
