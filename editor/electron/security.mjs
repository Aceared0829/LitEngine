import { protocol } from 'electron';

import { isTrustedRendererUrl } from './url-policy.mjs';

export { isTrustedRendererUrl };

/**
 * Installs restrictive navigation, popup, permission and webview policies.
 *
 * @param {import('electron').WebContents} webContents - Application renderer.
 * @param {{ isDevelopment: boolean, developmentUrl: string }} options - Application mode details.
 */
export const installNavigationPolicy = (webContents, options) => {
    webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    webContents.on('will-navigate', (event, url) => {
        if (!isTrustedRendererUrl(url, options)) {
            event.preventDefault();
        }
    });
    webContents.on('will-attach-webview', (event) => {
        event.preventDefault();
    });

    webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    webContents.session.setPermissionCheckHandler(() => false);
};

/**
 * Registers application protocol privileges before Electron is ready.
 */
export const registerSchemePrivileges = () => {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: 'lit-editor',
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                corsEnabled: true
            }
        }
    ]);
};
