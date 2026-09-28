import { useEffect, useState } from 'react';

import { initialEditorState } from '../domain/editor-reducer.mjs';
import { jsx } from '../jsx.mjs';
import { closeDesktopWindow, onPanelState, requestPanelState, sendPanelCommand } from '../platform/desktop-api.mjs';
import { HierarchyPanel } from './HierarchyPanel.mjs';
import { InspectorPanel } from './InspectorPanel.mjs';
import { PANEL_LABELS } from './layout-preferences.mjs';

/**
 * A native secondary window for a tool panel; the main editor owns the scene.
 *
 * @param {{ id: 'hierarchy'|'inspector' }} props - Panel identity.
 */
export function PopoutPanel({ id }) {
    const [state, setState] = useState(initialEditorState);
    useEffect(() => {
        document.title = `LitEngine · ${PANEL_LABELS[id]}`;
    }, [id]);
    useEffect(() => {
        const stop = onPanelState(setState);
        requestPanelState();
        return stop;
    }, []);
    const dispatch = command => sendPanelCommand(command);
    const content = id === 'hierarchy' ?
        jsx(HierarchyPanel, { state, dispatch, ready: state.runtimeStatus === 'ready', collapsed: false }) :
        jsx(InspectorPanel, { state, dispatch, ready: state.runtimeStatus === 'ready', collapsed: false });

    return jsx('div', { className: 'popout-app' },
        jsx('header', { className: 'popout-toolbar' },
            jsx('strong', null, 'LitEngine'),
            jsx('span', null, PANEL_LABELS[id]),
            jsx('button', { type: 'button', onClick: closeDesktopWindow, title: 'Dock panel back in the main editor' }, 'Dock to Editor')
        ),
        jsx('main', { className: 'popout-content' }, content)
    );
}
