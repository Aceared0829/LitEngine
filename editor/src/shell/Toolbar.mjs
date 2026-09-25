import { Button, Container } from '@playcanvas/pcui/react';
import { useEffect, useRef } from 'react';

import { jsx } from '../jsx.mjs';
import { isEditableTarget } from '../runtime/navigation-input.mjs';

/**
 * @param {{ state: import('../domain/editor-reducer.mjs').EditorState, dispatch: (command: import('../contracts/editor-contracts.mjs').EditorCommand) => void, ready: boolean, isNavigationActive: () => boolean }} props - Toolbar props.
 */
export function Toolbar({ state, dispatch, ready, isNavigationActive }) {
    const effectiveSpace = state.activeTool === 'scale' ? 'local' : state.coordinateSpace;
    const stateRef = useRef(state);
    stateRef.current = state;
    const dispatchRef = useRef(dispatch);
    dispatchRef.current = dispatch;
    const readyRef = useRef(ready);
    readyRef.current = ready;
    const isNavigationActiveRef = useRef(isNavigationActive);
    isNavigationActiveRef.current = isNavigationActive;

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

    const toolButton = (tool, label, shortcut, title) => jsx(Button, {
        class: ['toolbar-button', 'toolbar-tool', ...(state.activeTool === tool ? ['toolbar-button-active'] : [])],
        text: `${label} ${shortcut}`,
        tooltip: title,
        disabled: !ready,
        onClick: () => dispatch({ type: 'setTransformTool', tool })
    });

    const activeSnapTool = state.activeTool === 'select' ? 'translate' : state.activeTool;
    const increment = state.snap[`${activeSnapTool}Increment`];

    return jsx(
        Container,
        { class: ['editor-toolbar'] },
        jsx('div', { className: 'editor-brand' }, jsx('strong', null, 'LitEngine'), jsx('span', null, 'EDITOR')),
        jsx('div', { className: 'toolbar-divider' }),
        jsx(Button, {
            class: ['toolbar-button', 'toolbar-icon'],
            text: '↶',
            tooltip: state.history.undoLabel ? `Undo ${state.history.undoLabel} (Ctrl+Z)` : 'Nothing to undo',
            disabled: !ready || !state.history.canUndo,
            onClick: () => dispatch({ type: 'undo' })
        }),
        jsx(Button, {
            class: ['toolbar-button', 'toolbar-icon'],
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
            class: ['toolbar-button', 'coordinate-space'],
            text: effectiveSpace === 'world' ? 'World' : 'Local',
            tooltip: state.activeTool === 'scale' ? 'Scale uses local space' : 'Toggle world/local transform space (~ / X)',
            disabled: !ready || state.activeTool === 'scale',
            onClick: () => dispatch({
                type: 'setCoordinateSpace',
                coordinateSpace: stateRef.current.coordinateSpace === 'world' ? 'local' : 'world'
            })
        }),
        jsx(Button, {
            class: ['toolbar-button', 'snap-button', ...(state.snap.enabled ? ['toolbar-button-active'] : [])],
            text: `Snap ${state.snap.enabled ? 'On' : 'Off'} · ${increment}`,
            tooltip: `Toggle transform snap (${activeSnapTool} increment ${increment})`,
            disabled: !ready,
            onClick: () => dispatch({ type: 'setSnapEnabled', enabled: !stateRef.current.snap.enabled })
        }),
        jsx('div', { className: 'toolbar-spacer' }),
        jsx(Button, {
            class: 'toolbar-button',
            text: 'Frame · F',
            tooltip: 'Frame selection (F), or frame all (Shift+F)',
            disabled: !ready,
            onClick: () => dispatch({ type: 'focusSelected' })
        }),
        jsx(Button, {
            class: 'toolbar-button',
            text: 'Frame All',
            tooltip: 'Frame all scene entities (Shift+F)',
            disabled: !ready,
            onClick: () => dispatch({ type: 'frameAll' })
        }),
        jsx(Button, {
            class: ['toolbar-button', 'toolbar-danger'],
            text: 'Reset Scene',
            tooltip: 'Restore the demonstration scene',
            disabled: !ready,
            onClick: () => dispatch({ type: 'resetScene' })
        })
    );
}
