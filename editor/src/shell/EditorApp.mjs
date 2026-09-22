import { useEffect, useRef, useState } from 'react';

import { EditorController } from '../bridge/editor-controller.mjs';
import { initialEditorState } from '../domain/editor-reducer.mjs';
import { onDesktopEditorCommand } from '../platform/desktop-api.mjs';
import { jsx } from '../jsx.mjs';
import { DockResizeHandle } from './DockResizeHandle.mjs';
import { HierarchyPanel } from './HierarchyPanel.mjs';
import { InspectorPanel } from './InspectorPanel.mjs';
import { StatusBar } from './StatusBar.mjs';
import { Toolbar } from './Toolbar.mjs';
import { useDesktopLayout } from './use-desktop-layout.mjs';
import { Viewport } from './Viewport.mjs';

/**
 * UI composition root. The controller is the only route to the PlayCanvas runtime.
 */
export function EditorApp() {
    const workspaceRef = useRef(null);
    const canvasRef = useRef(null);
    const controllerRef = useRef(null);
    const [state, setState] = useState(initialEditorState);
    const { layout, updateLayout, resetDock } = useDesktopLayout(workspaceRef);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return undefined;
        }

        const controller = new EditorController(canvas);
        controllerRef.current = controller;
        const unsubscribe = controller.subscribe(setState);
        return () => {
            unsubscribe();
            controller.dispose();
            controllerRef.current = null;
        };
    }, []);

    /** @param {import('../contracts/editor-contracts.mjs').EditorCommand} command - Editor intent. */
    const dispatch = command => controllerRef.current?.dispatch(command);
    const ready = state.runtimeStatus === 'ready';

    useEffect(() => onDesktopEditorCommand(dispatch), [dispatch]);

    return jsx(
        'div',
        {
            ref: workspaceRef,
            className: `editor-app ${layout.hierarchyCollapsed ? 'hierarchy-collapsed' : ''} ${layout.inspectorCollapsed ? 'inspector-collapsed' : ''}`,
            style: {
                '--hierarchy-width': `${layout.hierarchyWidth}px`,
                '--inspector-width': `${layout.inspectorWidth}px`
            }
        },
        jsx(Toolbar, { state, dispatch, ready }),
        jsx(
            'aside',
            { className: 'editor-sidebar editor-hierarchy', 'aria-label': 'Scene panel' },
            jsx(HierarchyPanel, {
                state,
                dispatch,
                ready,
                collapsed: layout.hierarchyCollapsed,
                onToggle: () => updateLayout({ hierarchyCollapsed: !layout.hierarchyCollapsed })
            }),
            !layout.hierarchyCollapsed && jsx(DockResizeHandle, {
                side: 'left',
                onResize: hierarchyWidth => updateLayout({ hierarchyWidth }),
                onReset: () => resetDock('hierarchy')
            })
        ),
        jsx(Viewport, { canvasRef, state, dispatch }),
        jsx(
            'aside',
            { className: 'editor-sidebar editor-inspector', 'aria-label': 'Inspector panel' },
            jsx(InspectorPanel, {
                state,
                dispatch,
                ready,
                collapsed: layout.inspectorCollapsed,
                onToggle: () => updateLayout({ inspectorCollapsed: !layout.inspectorCollapsed })
            }),
            !layout.inspectorCollapsed && jsx(DockResizeHandle, {
                side: 'right',
                onResize: inspectorWidth => updateLayout({ inspectorWidth }),
                onReset: () => resetDock('inspector')
            })
        ),
        jsx(StatusBar, { state })
    );
}
