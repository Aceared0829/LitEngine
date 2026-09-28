import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEditorMenuTemplate } from './menu-template.mjs';
import { installNavigationPolicy, registerSchemePrivileges } from './security.mjs';
import { registerApplicationProtocol } from './protocol.mjs';

registerSchemePrivileges();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDevelopment = !app.isPackaged;
const developmentUrl = process.env.LIT_EDITOR_DEV_URL ?? 'http://127.0.0.1:5173';

/** @type {BrowserWindow | null} */
let mainWindow = null;
const panelWindows = new Map();
const floatingWindows = new Map();
let latestPanelState = null;
const externalPanels = new Set(['hierarchy', 'inspector']);
const panelCommands = new Set(['selectEntity', 'setTransform', 'resetTransformField', 'beginTransformDrag', 'previewTransformDrag', 'endTransformDrag', 'cancelTransformDrag']);

const validateFloatingRoot = (node, seen = new Set(), depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 3) {
        return null;
    }
    if (node.type === 'tabs' && Array.isArray(node.ids)) {
        const ids = node.ids.filter(id => externalPanels.has(id) && !seen.has(id) && seen.add(id));
        return ids.length ? { type: 'tabs', ids, active: ids.includes(node.active) ? node.active : ids[0] } : null;
    }
    if (node.type === 'split' && (node.axis === 'row' || node.axis === 'column')) {
        const first = validateFloatingRoot(node.first, seen, depth + 1);
        const second = validateFloatingRoot(node.second, seen, depth + 1);
        if (first && second) {
            return { type: 'split', axis: node.axis, ratio: Math.min(0.88, Math.max(0.12, Number.isFinite(node.ratio) ? node.ratio : 0.5)), first, second };
        }
    }
    return null;
};

const floatingPanelIds = node => (node.type === 'tabs' ? node.ids : [...floatingPanelIds(node.first), ...floatingPanelIds(node.second)]);

const floatingWindowForSender = sender => [...floatingWindows.values()].find(item => !item.window.isDestroyed() && item.window.webContents === sender);

/**
 * Sends one fixed editor command to the trusted renderer, if it is available.
 *
 * @param {'undo'|'redo'|'focusSelected'|'frameAll'} command - Editor command from native UI.
 */
const sendEditorCommand = (command) => {
    const window = mainWindow;
    if (!window || window.isDestroyed()) {
        return;
    }
    window.webContents.send('lit-editor:command', command);
};

const createMenu = () => {
    Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate(createEditorMenuTemplate({
        isDevelopment,
        sendEditorCommand
    })) : null);
};

ipcMain.on('lit-editor:close-window', (event) => {
    if (mainWindow && event.sender === mainWindow.webContents) {
        mainWindow.close();
        return;
    }
    for (const window of panelWindows.values()) {
        if (event.sender === window.webContents) {
            window.close();
            return;
        }
    }
    const floating = floatingWindowForSender(event.sender);
    floating?.window.close();
});

ipcMain.handle('lit-editor:open-floating-window', async (event, request) => {
    if (event.sender !== mainWindow?.webContents || !request || typeof request.id !== 'string') {
        return false;
    }
    const root = validateFloatingRoot(request.root);
    if (!root) {
        return false;
    }
    const existing = floatingWindows.get(request.id);
    if (existing && !existing.window.isDestroyed()) {
        existing.window.show();
        existing.window.focus();
        return true;
    }
    const width = Math.min(4000, Math.max(240, Number.isFinite(request.width) ? request.width : 420));
    const height = Math.min(4000, Math.max(180, Number.isFinite(request.height) ? request.height : 420));
    const window = new BrowserWindow({
        title: 'LitEngine · Tools',
        x: Math.round(Number.isFinite(request.screenX) ? request.screenX : 100),
        y: Math.round(Number.isFinite(request.screenY) ? request.screenY : 100),
        width: Math.round(width),
        height: Math.round(height),
        minWidth: 240,
        minHeight: 180,
        show: false,
        backgroundColor: '#191f26',
        titleBarStyle: 'hidden',
        titleBarOverlay: process.platform === 'win32' ? { color: '#222a32', symbolColor: '#e6edf4', height: 34 } : false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            webviewTag: false,
            devTools: isDevelopment
        }
    });
    floatingWindows.set(request.id, { window, root });
    installNavigationPolicy(window.webContents, { isDevelopment, developmentUrl });
    const showWindow = () => {
        if (!window.isDestroyed() && !window.isVisible()) {
            window.show();
        }
    };
    window.once('ready-to-show', showWindow);
    window.webContents.once('did-finish-load', () => {
        showWindow();
        window.webContents.send('lit-editor:floating-layout', root);
        if (latestPanelState) {
            window.webContents.send('lit-editor:panel-state', latestPanelState);
        }
    });
    let boundsTimer = null;
    const publishBounds = () => {
        clearTimeout(boundsTimer);
        boundsTimer = setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed() && !window.isDestroyed()) {
                const bounds = window.isMaximized() || window.isMinimized() ? window.getNormalBounds() : window.getBounds();
                mainWindow.webContents.send('lit-editor:floating-bounds-changed', request.id, {
                    screenX: bounds.x, screenY: bounds.y, width: bounds.width, height: bounds.height
                });
            }
        }, 120);
    };
    window.on('move', publishBounds);
    window.on('resize', publishBounds);
    window.on('closed', () => {
        clearTimeout(boundsTimer);
        if (floatingWindows.get(request.id)?.window === window) {
            floatingWindows.delete(request.id);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lit-editor:floating-window-closed', request.id);
            }
        }
    });
    try {
        const url = isDevelopment ? `${developmentUrl}/?floating=${encodeURIComponent(request.id)}` : `lit-editor://app/index.html?floating=${encodeURIComponent(request.id)}`;
        await window.loadURL(url);
        return true;
    } catch (error) {
        console.error(`Failed to open ${request.id} floating window`, error);
        window.close();
        return false;
    }
});

ipcMain.on('lit-editor:request-floating-layout', (event) => {
    const floating = floatingWindowForSender(event.sender);
    if (floating) {
        event.sender.send('lit-editor:floating-layout', floating.root);
    }
});

ipcMain.on('lit-editor:floating-layout-changed', (event, root) => {
    const floating = floatingWindowForSender(event.sender);
    const validated = validateFloatingRoot(root);
    if (!floating || !validated || floatingPanelIds(validated).sort().join(',') !== floatingPanelIds(floating.root).sort().join(',')) {
        return;
    }
    floating.root = validated;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('lit-editor:floating-layout-changed', [...floatingWindows].find(([, item]) => item === floating)?.[0], validated);
    }
});

ipcMain.on('lit-editor:focus-floating-window', (event, id) => {
    if (event.sender !== mainWindow?.webContents) {
        return;
    }
    const floating = floatingWindows.get(id)?.window;
    if (floating && !floating.isDestroyed()) {
        floating.show();
        floating.focus();
    }
});

ipcMain.on('lit-editor:close-floating-window', (event, id) => {
    if (event.sender === mainWindow?.webContents) {
        floatingWindows.get(id)?.window.close();
    }
});

ipcMain.handle('lit-editor:open-panel-window', async (event, id) => {
    if (event.sender !== mainWindow?.webContents || !externalPanels.has(id)) {
        return false;
    }
    const existing = panelWindows.get(id);
    if (existing && !existing.isDestroyed()) {
        existing.show();
        existing.focus();
        return true;
    }
    const window = new BrowserWindow({
        title: id === 'hierarchy' ? 'LitEngine · Scene Outliner' : 'LitEngine · Inspector',
        width: 420,
        height: 680,
        minWidth: 380,
        minHeight: 320,
        show: false,
        backgroundColor: '#191f26',
        titleBarStyle: 'hidden',
        titleBarOverlay: process.platform === 'win32' ? { color: '#202831', symbolColor: '#e6edf4', height: 42 } : false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            webviewTag: false,
            devTools: isDevelopment
        }
    });
    panelWindows.set(id, window);
    installNavigationPolicy(window.webContents, { isDevelopment, developmentUrl });
    const showWindow = () => {
        if (!window.isDestroyed() && !window.isVisible()) {
            window.show();
        }
    };
    window.once('ready-to-show', showWindow);
    window.webContents.once('did-finish-load', () => {
        showWindow();
        if (latestPanelState) {
            window.webContents.send('lit-editor:panel-state', latestPanelState);
        }
    });
    window.on('closed', () => {
        if (panelWindows.get(id) === window) {
            panelWindows.delete(id);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lit-editor:panel-window-closed', id);
            }
        }
    });
    try {
        const url = isDevelopment ? `${developmentUrl}/?panel=${id}` : `lit-editor://app/index.html?panel=${id}`;
        await window.loadURL(url);
        return true;
    } catch (error) {
        console.error(`Failed to open ${id} panel window`, error);
        window.close();
        return false;
    }
});

ipcMain.on('lit-editor:panel-state', (event, state) => {
    if (event.sender !== mainWindow?.webContents || !state || typeof state !== 'object') {
        return;
    }
    latestPanelState = state;
    for (const window of panelWindows.values()) {
        if (!window.isDestroyed() && !window.webContents.isLoading()) {
            window.webContents.send('lit-editor:panel-state', state);
        }
    }
    for (const item of floatingWindows.values()) {
        const window = item.window;
        if (!window.isDestroyed() && !window.webContents.isLoading()) {
            window.webContents.send('lit-editor:panel-state', state);
        }
    }
});

ipcMain.on('lit-editor:request-panel-state', (event) => {
    if (latestPanelState && ([...panelWindows.values()].some(window => !window.isDestroyed() && event.sender === window.webContents) || floatingWindowForSender(event.sender))) {
        event.sender.send('lit-editor:panel-state', latestPanelState);
    }
});

ipcMain.on('lit-editor:panel-command', (event, command) => {
    if (!command || typeof command !== 'object' || !panelCommands.has(command.type) || !mainWindow || mainWindow.isDestroyed()) {
        return;
    }
    if ([...panelWindows.values()].some(window => !window.isDestroyed() && event.sender === window.webContents) || floatingWindowForSender(event.sender)) {
        mainWindow.webContents.send('lit-editor:panel-command', command);
    }
});

ipcMain.on('lit-editor:focus-panel-window', (event, id) => {
    if (event.sender !== mainWindow?.webContents || !externalPanels.has(id)) {
        return;
    }
    const window = panelWindows.get(id);
    if (window && !window.isDestroyed()) {
        window.show();
        window.focus();
    }
});

ipcMain.on('lit-editor:close-panel-window', (event, id) => {
    if (event.sender !== mainWindow?.webContents || !externalPanels.has(id)) {
        return;
    }
    const window = panelWindows.get(id);
    if (window && !window.isDestroyed()) {
        window.close();
    }
});

const createWindow = async () => {
    const window = new BrowserWindow({
        title: 'LitEngine Editor',
        width: 1440,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        show: false,
        backgroundColor: '#111418',
        titleBarStyle: 'hidden',
        titleBarOverlay: process.platform === 'win32' ? { color: '#202831', symbolColor: '#e6edf4', height: 42 } : false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            webviewTag: false,
            devTools: isDevelopment
        }
    });

    mainWindow = window;
    installNavigationPolicy(window.webContents, { isDevelopment, developmentUrl });
    const showWindow = () => {
        if (!window.isDestroyed() && !window.isVisible()) {
            window.show();
        }
    };
    window.once('ready-to-show', showWindow);
    window.webContents.once('did-finish-load', showWindow);
    window.on('closed', () => {
        if (mainWindow === window) {
            mainWindow = null;
            latestPanelState = null;
            for (const panelWindow of panelWindows.values()) {
                panelWindow.close();
            }
            for (const item of floatingWindows.values()) {
                item.window.close();
            }
        }
    });

    if (isDevelopment) {
        await window.loadURL(developmentUrl);
    } else {
        await window.loadURL('lit-editor://app/index.html');
    }
};

app.setAppUserModelId('com.litengine.editor');

app.whenReady().then(async () => {
    registerApplicationProtocol(path.resolve(__dirname, '..', 'dist'));
    createMenu();
    await createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow().catch(error => console.error('Failed to recreate LitEngine Editor window', error));
        }
    });
}).catch((error) => {
    console.error('Failed to start LitEngine Editor', error);
    app.quit();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
