'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const allowedCommands = new Set(['undo', 'redo', 'focusSelected', 'frameAll']);

contextBridge.exposeInMainWorld('litEngineDesktop', Object.freeze({
    /**
     * @param {(command: 'undo'|'redo'|'focusSelected'|'frameAll') => void} callback - Native menu command listener.
     * @returns {() => void} Unsubscribe callback.
     */
    onEditorCommand(callback) {
        const listener = (_event, command) => {
            if (allowedCommands.has(command)) {
                callback(command);
            }
        };
        ipcRenderer.on('lit-editor:command', listener);
        return () => ipcRenderer.removeListener('lit-editor:command', listener);
    }
}));
