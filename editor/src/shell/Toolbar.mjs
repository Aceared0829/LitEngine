import { Button, Container } from '@playcanvas/pcui/react';
import { useEffect } from 'react';

import { jsx } from '../jsx.mjs';

/**
 * @param {EventTarget | null} target - Potential active element.
 * @returns {boolean} Whether the target owns editable text input.
 */
const isEditableTarget = (target) => {
    return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"], .pcui-text-input'));
};

/**
 * @param {{ state: import('../domain/editor-reducer.mjs').EditorState, dispatch: (command: import('../contracts/editor-contracts.mjs').EditorCommand) => void, ready: boolean }} props - Toolbar props.
 */
export function Toolbar({ state, dispatch, ready }) {
    const effectiveSpace = state.activeTool === 'scale' ? 'local' : state.coordinateSpace;

    useEffect(() => {
        /** @param {KeyboardEvent} event - Keyboard event. */
        const onKeyDown = (event) => {
            if (event.isComposing || isEditableTarget(event.target)) {
                return;
            }

            const key = event.key.toLowerCase();
            const hasMeta = event.ctrlKey || event.metaKey;
            if (hasMeta && key === 'z') {
                event.preventDefault();
                dispatch(event.shiftKey ? { type: 'redo' } : { type: 'undo' });
                return;
            }
            if (hasMeta && key === 'y') {
                event.preventDefault();
                dispatch({ type: 'redo' });
                return;
            }
            if (!ready || hasMeta || event.altKey || state.viewportNavigationActive) {
                return;
            }

            switch (key) {
                case 'q':
                    event.preventDefault();
                    dispatch({ type: 'setTransformTool', tool: 'select' });
                    break;
                case 'w':
                case '1':
                    event.preventDefault();
                    dispatch({ type: 'setTransformTool', tool: 'translate' });
                    break;
                case 'e':
                case '2':
                    event.preventDefault();
                    dispatch({ type: 'setTransformTool', tool: 'rotate' });
                    break;
                case 'r':
                case '3':
                    event.preventDefault();
                    dispatch({ type: 'setTransformTool', tool: 'scale' });
                    break;
                case 'x':
                    if (state.activeTool !== 'scale') {
                        event.preventDefault();
                        dispatch({
                            type: 'setCoordinateSpace',
                            coordinateSpace: state.coordinateSpace === 'world' ? 'local' : 'world'
                        });
                    }
                    break;
                case 'f':
                    event.preventDefault();
                    dispatch(event.shiftKey ? { type: 'frameAll' } : { type: 'focusSelected' });
                    break;
                case 'escape':
                    event.preventDefault();
                    dispatch({ type: 'selectEntity', entityId: null });
                    break;
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [dispatch, ready, state.activeTool, state.coordinateSpace, state.viewportNavigationActive]);

    const toolButton = (tool, label, shortcut, title) => jsx(Button, {
        className: `toolbar-button toolbar-tool ${state.activeTool === tool ? 'toolbar-button-active' : ''}`,
        text: `${label} ${shortcut}`,
        tooltip: title,
        disabled: !ready,
        onClick: () => dispatch({ type: 'setTransformTool', tool })
    });

    const activeSnapTool = state.activeTool === 'select' ? 'translate' : state.activeTool;
    const increment = state.snap[`${activeSnapTool}Increment`];

    return jsx(
        Container,
        { className: 'editor-toolbar' },
        jsx('div', { className: 'editor-brand' }, jsx('strong', null, 'LitEngine'), jsx('span', null, 'EDITOR')),
        jsx('div', { className: 'toolbar-divider' }),
        jsx(Button, {
            className: 'toolbar-button toolbar-icon',
            text: '↶',
            tooltip: state.history.undoLabel ? `Undo ${state.history.undoLabel} (Ctrl+Z)` : 'Nothing to undo',
            disabled: !ready || !state.history.canUndo,
            onClick: () => dispatch({ type: 'undo' })
        }),
        jsx(Button, {
            className: 'toolbar-button toolbar-icon',
            text: '↷',
            tooltip: state.history.redoLabel ? `Redo ${state.history.redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo',
            disabled: !ready || !state.history.canRedo,
            onClick: () => dispatch({ type: 'redo' })
        }),
        jsx('div', { className: 'toolbar-divider' }),
        toolButton('select', 'Select', 'Q', 'Select tool (Q)'),
        toolButton('translate', 'Move', 'W', 'Move tool (W / 1)'),
        toolButton('rotate', 'Rotate', 'E', 'Rotate tool (E / 2)'),
        toolButton('scale', 'Scale', 'R', 'Scale tool (R / 3)'),
        jsx('div', { className: 'toolbar-divider' }),
        jsx(Button, {
            className: 'toolbar-button coordinate-space',
            text: effectiveSpace === 'world' ? 'World' : 'Local',
            tooltip: state.activeTool === 'scale' ? 'Scale uses local space' : 'Toggle world/local transform space (X)',
            disabled: !ready || state.activeTool === 'scale',
            onClick: () => dispatch({
                type: 'setCoordinateSpace',
                coordinateSpace: state.coordinateSpace === 'world' ? 'local' : 'world'
            })
        }),
        jsx(Button, {
            className: `toolbar-button snap-button ${state.snap.enabled ? 'toolbar-button-active' : ''}`,
            text: `Snap ${state.snap.enabled ? 'On' : 'Off'} · ${increment}`,
            tooltip: `Toggle transform snap (${activeSnapTool} increment ${increment})`,
            disabled: !ready,
            onClick: () => dispatch({ type: 'setSnapEnabled', enabled: !state.snap.enabled })
        }),
        jsx('div', { className: 'toolbar-spacer' }),
        jsx(Button, {
            className: 'toolbar-button',
            text: 'Frame · F',
            tooltip: 'Frame selection (F), or frame all (Shift+F)',
            disabled: !ready,
            onClick: () => dispatch({ type: 'focusSelected' })
        }),
        jsx(Button, {
            className: 'toolbar-button',
            text: 'Frame All',
            tooltip: 'Frame all scene entities (Shift+F)',
            disabled: !ready,
            onClick: () => dispatch({ type: 'frameAll' })
        }),
        jsx(Button, {
            className: 'toolbar-button toolbar-danger',
            text: 'Reset Scene',
            tooltip: 'Restore the demonstration scene',
            disabled: !ready,
            onClick: () => dispatch({ type: 'resetScene' })
        })
    );
}
