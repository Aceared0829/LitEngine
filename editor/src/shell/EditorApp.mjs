import { useEffect, useRef, useState } from 'react';

import { EditorController } from '../bridge/editor-controller.mjs';
import { initialEditorState } from '../domain/editor-reducer.mjs';
import { closeFloatingWindow, closePanelWindow, onDesktopEditorCommand, onFloatingBoundsChanged, onFloatingLayoutChanged, onFloatingWindowClosed, onPanelCommand, onPanelWindowClosed, openFloatingWindow, openPanelWindow, publishPanelState } from '../platform/desktop-api.mjs';
import { jsx } from '../jsx.mjs';
import { StatusBar } from './StatusBar.mjs';
import { Toolbar } from './Toolbar.mjs';
import { useDesktopLayout } from './use-desktop-layout.mjs';
import { WorkspacePanels } from './WorkspacePanels.mjs';

/**
 * UI composition root. The controller is the only route to the PlayCanvas runtime.
 */
export function EditorApp() {
    const workspaceRef = useRef(null);
    const canvasRef = useRef(null);
    const controllerRef = useRef(null);
    const [state, setState] = useState(initialEditorState);
    const [showHelp, setShowHelp] = useState(false);
    const workspaceLayout = useDesktopLayout(workspaceRef);
    const { layout, hide, show, externalize, externalizeFloat, restoreExternal, restoreExternalFloat, updateExternalFloat, resetLayout } = workspaceLayout;
    const startupExternalRef = useRef(layout.external);
    const startupGroupsRef = useRef(layout.externalGroups);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return undefined;
        }

        let controller = null;
        let unsubscribe = null;
        let starting = false;
        const observer = new ResizeObserver(() => {
            if (controller || starting || canvas.clientWidth < 8 || canvas.clientHeight < 8) {
                return;
            }
            starting = true;
            controller = new EditorController(canvas);
            controllerRef.current = controller;
            unsubscribe = controller.subscribe(setState);
            observer.disconnect();
        });
        observer.observe(canvas);
        return () => {
            observer.disconnect();
            unsubscribe?.();
            controller?.dispose();
            controllerRef.current = null;
        };
    }, []);

    /** @param {import('../contracts/editor-contracts.mjs').EditorCommand} command - Editor intent. */
    const dispatch = command => controllerRef.current?.dispatch(command);
    const dispatchRef = useRef(dispatch);
    dispatchRef.current = dispatch;
    const restoreExternalRef = useRef(restoreExternal);
    restoreExternalRef.current = restoreExternal;
    const restoreGroupRef = useRef(restoreExternalFloat);
    restoreGroupRef.current = restoreExternalFloat;
    const updateGroupRef = useRef(updateExternalFloat);
    updateGroupRef.current = updateExternalFloat;
    const ready = state.runtimeStatus === 'ready';

    useEffect(() => onDesktopEditorCommand(command => dispatchRef.current(command)), []);
    useEffect(() => onPanelCommand(command => dispatchRef.current(command)), []);
    useEffect(() => onPanelWindowClosed(id => restoreExternalRef.current(id)), []);
    useEffect(() => onFloatingWindowClosed(id => restoreGroupRef.current(id)), []);
    useEffect(() => onFloatingLayoutChanged((id, root) => updateGroupRef.current(id, { root })), []);
    useEffect(() => onFloatingBoundsChanged((id, bounds) => updateGroupRef.current(id, bounds)), []);
    useEffect(() => publishPanelState(state), [state]);
    useEffect(() => {
        if (!ready) {
            return;
        }
        for (const id of startupExternalRef.current) {
            openPanelWindow(id).then((opened) => {
                if (!opened) {
                    restoreExternalRef.current(id);
                }
            });
        }
        for (const group of startupGroupsRef.current) {
            openFloatingWindow(group).then((opened) => {
                if (!opened) {
                    restoreGroupRef.current(group.id);
                }
            });
        }
        startupExternalRef.current = [];
        startupGroupsRef.current = [];
    }, [ready]);

    const openExternal = async (id) => {
        if (await openPanelWindow(id)) {
            externalize(id);
        }
    };
    const openExternalFloat = async (item, position) => {
        const request = { ...item, ...position };
        externalizeFloat(item.id, position);
        if (!(await openFloatingWindow(request))) {
            restoreExternalFloat(item.id);
        }
    };
    const resetWorkspace = () => {
        layout.external.forEach(closePanelWindow);
        layout.externalGroups.forEach(group => closeFloatingWindow(group.id));
        resetLayout();
    };

    return jsx(
        'div',
        {
            ref: workspaceRef,
            className: 'editor-app'
        },
        jsx(Toolbar, { state, dispatch, ready, isNavigationActive: () => controllerRef.current?.getState().viewportNavigationActive ?? false, layout, hide, show, openExternal, resetLayout: resetWorkspace, showHelp, setShowHelp }),
        jsx(WorkspacePanels, { workspaceRef, canvasRef, state, dispatch, ...workspaceLayout, openExternal, openExternalFloat, showHelp, setShowHelp }),
        jsx(StatusBar, { state })
    );
}
