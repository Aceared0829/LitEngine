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
 */

/**
 * @param {(command: { type: DesktopEditorCommand }) => void} callback - Handler for typed editor commands.
 * @returns {() => void} Unsubscribe callback.
 */
export const onDesktopEditorCommand = (callback) => {
    const bridge = /** @type {DesktopBridge | undefined} */ (globalThis.litEngineDesktop);
    return bridge?.onEditorCommand(type => callback({ type })) ?? (() => {});
};
