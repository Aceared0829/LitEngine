/**
 * Builds the native menu without editor command accelerators. Toolbar handles those keys in the
 * renderer, where it can leave text inputs (including their native undo) alone.
 *
 * @param {{ isDevelopment: boolean, sendEditorCommand: (command: 'undo'|'redo'|'focusSelected'|'frameAll') => void }} options - Menu options.
 * @returns {import('electron').MenuItemConstructorOptions[]} Menu template.
 */
export const createEditorMenuTemplate = ({ isDevelopment, sendEditorCommand }) => [
    {
        label: 'File',
        submenu: [
            { role: 'close' }
        ]
    },
    {
        label: 'Edit',
        submenu: [
            { label: 'Undo', click: () => sendEditorCommand('undo') },
            { label: 'Redo', click: () => sendEditorCommand('redo') }
        ]
    },
    {
        label: 'View',
        submenu: [
            { label: 'Frame Selection', click: () => sendEditorCommand('focusSelected') },
            { label: 'Frame All', click: () => sendEditorCommand('frameAll') },
            { type: 'separator' },
            ...(isDevelopment ? [{ role: 'toggleDevTools' }] : [])
        ]
    },
    {
        label: 'Help',
        submenu: [
            { role: 'about' }
        ]
    }
];
