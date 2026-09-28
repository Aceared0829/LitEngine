import { useEffect, useRef, useState } from 'react';

import { jsx } from '../jsx.mjs';
import { closeDesktopWindow, focusFloatingWindow, focusPanelWindow, isDesktopEditor } from '../platform/desktop-api.mjs';
import { containsPanel } from './layout-preferences.mjs';
import { isEditableTarget } from '../runtime/navigation-input.mjs';

/**
 * @param {object} props - Global toolbar and menu actions.
 * @param {import('../domain/editor-reducer.mjs').EditorState} props.state - Editor state.
 * @param {(command: import('../contracts/editor-contracts.mjs').EditorCommand) => void} props.dispatch - Command dispatcher.
 * @param {boolean} props.ready - Runtime readiness.
 * @param {() => boolean} props.isNavigationActive - Navigation state reader.
 * @param {import('./layout-preferences.mjs').WorkspaceLayout} props.layout - Workspace layout.
 * @param {(id: import('./layout-preferences.mjs').PanelId) => void} props.hide - Hide a panel.
 * @param {(id: import('./layout-preferences.mjs').PanelId) => void} props.show - Restore a panel.
 * @param {(id: 'hierarchy'|'inspector') => void} props.openExternal - Open a native tool window.
 * @param {() => void} props.resetLayout - Restore default layout.
 * @param {boolean} props.showHelp - Viewport help visibility.
 * @param {(visible: boolean) => void} props.setShowHelp - Set viewport help visibility.
 */
export function Toolbar({ state, dispatch, ready, isNavigationActive, layout, hide, show, openExternal, resetLayout, showHelp, setShowHelp }) {
    const [openMenu, setOpenMenu] = useState(null);
    const menuRef = useRef(null);
    const stateRef = useRef(state);
    stateRef.current = state;
    const dispatchRef = useRef(dispatch);
    dispatchRef.current = dispatch;
    const readyRef = useRef(ready);
    readyRef.current = ready;
    const isNavigationActiveRef = useRef(isNavigationActive);
    isNavigationActiveRef.current = isNavigationActive;

    useEffect(() => {
        const closeOnOutside = (event) => {
            if (!menuRef.current?.contains(event.target)) {
                setOpenMenu(null);
            }
        };
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') {
                setOpenMenu(null);
            }
        };
        document.addEventListener('pointerdown', closeOnOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, []);

    useEffect(() => {
        const activeMousePointers = new Set();
        const onPointerDown = (event) => {
            if (event.pointerType === 'mouse') {
                activeMousePointers.add(event.pointerId);
            }
        };
        const onPointerEnd = event => activeMousePointers.delete(event.pointerId);
        const onWindowBlur = () => activeMousePointers.clear();

        /** @param {KeyboardEvent} event - Keyboard event. */
        const onKeyDown = (event) => {
            if (event.isComposing || isEditableTarget(event.target)) {
                return;
            }

            if (event.key === 'Alt') {
                event.preventDefault();
                return;
            }

            const key = event.key.toLowerCase();
            const hasMeta = event.ctrlKey || event.metaKey;
            if (hasMeta && key === 'z') {
                event.preventDefault();
                dispatchRef.current(event.shiftKey ? { type: 'redo' } : { type: 'undo' });
                return;
            }
            if (hasMeta && key === 'y') {
                event.preventDefault();
                dispatchRef.current({ type: 'redo' });
                return;
            }
            const isToolShortcut = ['w', 'e', 'r', '1', '2', '3'].includes(key);
            // Alt may still be held after the mouse is released to finish an Alt-drag duplicate.
            const altBlocksShortcut = event.altKey && (!isToolShortcut || activeMousePointers.size > 0);
            if (!readyRef.current || hasMeta || altBlocksShortcut || isNavigationActiveRef.current()) {
                return;
            }

            if (key === 'x' || key === '`' || key === '~' || event.code === 'Backquote') {
                if (stateRef.current.activeTool !== 'scale') {
                    event.preventDefault();
                    dispatchRef.current({
                        type: 'setCoordinateSpace',
                        coordinateSpace: stateRef.current.coordinateSpace === 'world' ? 'local' : 'world'
                    });
                }
                return;
            }

            switch (key) {
                case 'q':
                    event.preventDefault();
                    dispatchRef.current({ type: 'setTransformTool', tool: 'select' });
                    break;
                case 'w':
                case '1':
                    event.preventDefault();
                    dispatchRef.current({ type: 'setTransformTool', tool: 'translate' });
                    break;
                case 'e':
                case '2':
                    event.preventDefault();
                    dispatchRef.current({ type: 'setTransformTool', tool: 'rotate' });
                    break;
                case 'r':
                case '3':
                    event.preventDefault();
                    dispatchRef.current({ type: 'setTransformTool', tool: 'scale' });
                    break;
                case 'f':
                    event.preventDefault();
                    dispatchRef.current(event.shiftKey ? { type: 'frameAll' } : { type: 'focusSelected' });
                    break;
                case 'escape':
                    event.preventDefault();
                    dispatchRef.current({ type: 'selectEntity', entityId: null });
                    break;
            }
        };

        /** @param {KeyboardEvent} event - Keyboard event. */
        const onKeyUp = (event) => {
            if (event.key !== 'Alt' || isEditableTarget(event.target)) {
                return;
            }

            event.preventDefault();
            document.querySelector('.viewport-canvas')?.focus({ preventScroll: true });
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('pointerup', onPointerEnd, true);
        window.addEventListener('pointercancel', onPointerEnd, true);
        window.addEventListener('blur', onWindowBlur);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('pointerdown', onPointerDown, true);
            window.removeEventListener('pointerup', onPointerEnd, true);
            window.removeEventListener('pointercancel', onPointerEnd, true);
            window.removeEventListener('blur', onWindowBlur);
        };
    }, []);

    const tool = (label, shortcut, toolName) => ({ label, shortcut, disabled: !ready, checked: state.activeTool === toolName, action: () => dispatch({ type: 'setTransformTool', tool: toolName }) });
    const menus = {
        File: [
            { label: 'Reset Scene', disabled: !ready, action: () => dispatch({ type: 'resetScene' }) },
            { label: 'Close Window', shortcut: 'Alt+F4', disabled: !isDesktopEditor(), action: closeDesktopWindow }
        ],
        Edit: [
            { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !ready || !state.history.canUndo, action: () => dispatch({ type: 'undo' }) },
            { label: 'Redo', shortcut: 'Ctrl+Y', disabled: !ready || !state.history.canRedo, action: () => dispatch({ type: 'redo' }) }
        ],
        Window: [
            { label: 'Scene Outliner',
                checked: !layout.hidden.includes('hierarchy'),
                action: () => {
                    const group = layout.externalGroups.find(item => containsPanel(item.root, 'hierarchy'));
                    return group ? focusFloatingWindow(group.id) : layout.external.includes('hierarchy') ? focusPanelWindow('hierarchy') : layout.hidden.includes('hierarchy') ? show('hierarchy') : hide('hierarchy');
                } },
            { label: 'Inspector',
                checked: !layout.hidden.includes('inspector'),
                action: () => {
                    const group = layout.externalGroups.find(item => containsPanel(item.root, 'inspector'));
                    return group ? focusFloatingWindow(group.id) : layout.external.includes('inspector') ? focusPanelWindow('inspector') : layout.hidden.includes('inspector') ? show('inspector') : hide('inspector');
                } },
            { label: 'Open Scene Outliner in New Window', disabled: !isDesktopEditor() || layout.external.includes('hierarchy') || layout.externalGroups.some(item => containsPanel(item.root, 'hierarchy')), action: () => openExternal('hierarchy') },
            { label: 'Open Inspector in New Window', disabled: !isDesktopEditor() || layout.external.includes('inspector') || layout.externalGroups.some(item => containsPanel(item.root, 'inspector')), action: () => openExternal('inspector') },
            { label: 'Reset Layout', action: resetLayout }
        ],
        Tools: [
            tool('Select', 'Q', 'select'), tool('Move', 'W', 'translate'), tool('Rotate', 'E', 'rotate'), tool('Scale', 'R', 'scale'),
            { label: 'Frame Selection', shortcut: 'F', disabled: !ready, action: () => dispatch({ type: 'focusSelected' }) },
            { label: 'Frame All', shortcut: 'Shift+F', disabled: !ready, action: () => dispatch({ type: 'frameAll' }) }
        ],
        Help: [{ label: 'Viewport Controls', checked: showHelp, action: () => setShowHelp(!showHelp) }]
    };

    return jsx('header', { className: `editor-toolbar ${isDesktopEditor() ? 'desktop-chrome' : ''}`, ref: menuRef },
        jsx('div', { className: 'editor-brand' }, jsx('strong', null, 'LitEngine'), jsx('span', null, 'EDITOR')),
        jsx('nav', { className: 'global-menus', 'aria-label': 'Editor menus' },
            ...Object.entries(menus).map(([name, entries]) => jsx('div', { className: 'global-menu', key: name },
                jsx('button', {
                    type: 'button',
                    className: `global-menu-trigger ${openMenu === name ? 'is-open' : ''}`,
                    'aria-haspopup': 'menu',
                    'aria-expanded': openMenu === name,
                    onClick: () => setOpenMenu(openMenu === name ? null : name)
                }, name),
                openMenu === name && jsx('div', { className: 'global-menu-popover', role: 'menu', 'aria-label': name },
                    ...entries.map(entry => jsx('button', {
                        type: 'button',
                        role: 'menuitem',
                        key: entry.label,
                        disabled: entry.disabled,
                        className: 'global-menu-item',
                        onClick: () => {
                            entry.action(); setOpenMenu(null);
                        }
                    }, jsx('span', { className: 'menu-check' }, entry.checked ? '✓' : ''), entry.label,
                    entry.shortcut && jsx('span', { className: 'menu-shortcut' }, entry.shortcut)))
                )
            ))
        ),
        jsx('span', { className: 'global-bar-title' }, 'Scene Workspace')
    );
}
