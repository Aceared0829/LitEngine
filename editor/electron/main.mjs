import { app, BrowserWindow, Menu } from 'electron';
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
    Menu.setApplicationMenu(Menu.buildFromTemplate(createEditorMenuTemplate({
        isDevelopment,
        sendEditorCommand
    })));
};

const createWindow = async () => {
    const window = new BrowserWindow({
        title: 'LitEngine Editor',
        width: 1440,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        show: false,
        backgroundColor: '#111418',
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
    window.once('ready-to-show', () => window.show());
    window.on('closed', () => {
        if (mainWindow === window) {
            mainWindow = null;
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
