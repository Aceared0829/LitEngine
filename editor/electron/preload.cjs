'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const allowedCommands = new Set(['undo', 'redo', 'focusSelected', 'frameAll']);

contextBridge.exposeInMainWorld('litEngineDesktop', Object.freeze({
    isDesktop: true,
    closeWindow() {
        ipcRenderer.send('lit-editor:close-window');
    },
    openPanelWindow(id) {
        return ipcRenderer.invoke('lit-editor:open-panel-window', id);
    },
    openFloatingWindow(request) {
        return ipcRenderer.invoke('lit-editor:open-floating-window', request);
    },
    focusFloatingWindow(id) {
        ipcRenderer.send('lit-editor:focus-floating-window', id);
    },
    closeFloatingWindow(id) {
        ipcRenderer.send('lit-editor:close-floating-window', id);
    },
    focusPanelWindow(id) {
        ipcRenderer.send('lit-editor:focus-panel-window', id);
    },
    closePanelWindow(id) {
        ipcRenderer.send('lit-editor:close-panel-window', id);
    },
    publishPanelState(state) {
        ipcRenderer.send('lit-editor:panel-state', state);
    },
    sendPanelCommand(command) {
        ipcRenderer.send('lit-editor:panel-command', command);
    },
    onPanelState(callback) {
        const listener = (_event, state) => callback(state);
        ipcRenderer.on('lit-editor:panel-state', listener);
        return () => ipcRenderer.removeListener('lit-editor:panel-state', listener);
    },
    requestPanelState() {
        ipcRenderer.send('lit-editor:request-panel-state');
    },
    onFloatingLayout(callback) {
        const listener = (_event, layout) => callback(layout);
        ipcRenderer.on('lit-editor:floating-layout', listener);
        return () => ipcRenderer.removeListener('lit-editor:floating-layout', listener);
    },
    requestFloatingLayout() {
        ipcRenderer.send('lit-editor:request-floating-layout');
    },
    publishFloatingLayout(layout) {
        ipcRenderer.send('lit-editor:floating-layout-changed', layout);
    },
    onFloatingLayoutChanged(callback) {
        const listener = (_event, id, layout) => callback(id, layout);
        ipcRenderer.on('lit-editor:floating-layout-changed', listener);
        return () => ipcRenderer.removeListener('lit-editor:floating-layout-changed', listener);
    },
    onFloatingBoundsChanged(callback) {
        const listener = (_event, id, bounds) => callback(id, bounds);
        ipcRenderer.on('lit-editor:floating-bounds-changed', listener);
        return () => ipcRenderer.removeListener('lit-editor:floating-bounds-changed', listener);
    },
    onFloatingWindowClosed(callback) {
        const listener = (_event, id) => callback(id);
        ipcRenderer.on('lit-editor:floating-window-closed', listener);
        return () => ipcRenderer.removeListener('lit-editor:floating-window-closed', listener);
    },
    onPanelCommand(callback) {
        const listener = (_event, command) => callback(command);
        ipcRenderer.on('lit-editor:panel-command', listener);
        return () => ipcRenderer.removeListener('lit-editor:panel-command', listener);
    },
    onPanelWindowClosed(callback) {
        const listener = (_event, id) => callback(id);
        ipcRenderer.on('lit-editor:panel-window-closed', listener);
        return () => ipcRenderer.removeListener('lit-editor:panel-window-closed', listener);
    },
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
