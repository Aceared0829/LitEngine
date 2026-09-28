import { useEffect, useRef, useState } from 'react';

import { initialEditorState } from '../domain/editor-reducer.mjs';
import { jsx } from '../jsx.mjs';
import { onFloatingLayout, onPanelState, publishFloatingLayout, requestFloatingLayout, requestPanelState, sendPanelCommand } from '../platform/desktop-api.mjs';
import { HierarchyPanel } from './HierarchyPanel.mjs';
import { InspectorPanel } from './InspectorPanel.mjs';
import { PANEL_LABELS } from './layout-preferences.mjs';

const updateTabs = (node, id) => (node.type === 'tabs' ?
    (node.ids.includes(id) ? { ...node, active: id } : node) :
    { ...node, first: updateTabs(node.first, id), second: updateTabs(node.second, id) });

const updateSplit = (node, path, ratio) => {
    if (node.type !== 'split') {
        return node;
    }
    if (!path.length) {
        return { ...node, ratio: Math.min(0.88, Math.max(0.12, ratio)) };
    }
    const [side, ...rest] = path;
    return { ...node, [side]: updateSplit(node[side], rest, ratio) };
};

/**
 * A complete floating tool group in its own native desktop window.
 *
 * @param {{ id: string }} props - Native group identity.
 */
export function PopoutGroup({ id }) {
    const [state, setState] = useState(initialEditorState);
    const [root, setRoot] = useState(null);
    const rootRef = useRef(null);

    useEffect(() => {
        document.title = 'LitEngine · Tools';
        const stopState = onPanelState(setState);
        const stopLayout = onFloatingLayout((next) => {
            rootRef.current = next;
            setRoot(next);
        });
        requestPanelState();
        requestFloatingLayout();
        return () => {
            stopState();
            stopLayout();
        };
    }, [id]);

    const commit = (transform) => {
        if (!rootRef.current) {
            return;
        }
        const next = transform(rootRef.current);
        rootRef.current = next;
        setRoot(next);
        publishFloatingLayout(next);
    };
    const dispatch = command => sendPanelCommand(command);
    const renderNode = (node, path = []) => {
        if (node.type === 'tabs') {
            return jsx('section', { className: 'workspace-group', 'aria-label': `${PANEL_LABELS[node.active]} panel group` },
                jsx('div', { className: 'workspace-tabs', role: 'tablist', 'aria-label': 'Panel tabs' },
                    ...node.ids.map(panelId => jsx('button', {
                        type: 'button',
                        role: 'tab',
                        key: panelId,
                        className: `native-floating-tab ${node.active === panelId ? 'is-active' : ''}`,
                        'aria-selected': node.active === panelId,
                        onClick: () => commit(current => updateTabs(current, panelId))
                    }, PANEL_LABELS[panelId])),
                    jsx('div', { className: 'native-floating-grip', 'aria-hidden': true })
                ),
                ...node.ids.map(panelId => jsx('div', {
                    className: 'workspace-content',
                    role: 'tabpanel',
                    hidden: node.active !== panelId,
                    key: panelId
                }, panelId === 'hierarchy' ?
                    jsx(HierarchyPanel, { state, dispatch, ready: state.runtimeStatus === 'ready', collapsed: false }) :
                    jsx(InspectorPanel, { state, dispatch, ready: state.runtimeStatus === 'ready', collapsed: false })))
            );
        }
        return jsx('div', { className: `workspace-split workspace-split-${node.axis}` },
            jsx('div', { className: 'workspace-split-child', style: { flexGrow: node.ratio } }, renderNode(node.first, [...path, 'first'])),
            jsx('button', {
                type: 'button',
                className: 'workspace-split-gutter',
                'aria-label': `Resize ${node.axis === 'row' ? 'horizontal' : 'vertical'} panel split`,
                onPointerDown: (event) => {
                    if (event.button !== 0) {
                        return;
                    }
                    event.preventDefault();
                    const rect = event.currentTarget.parentElement.getBoundingClientRect();
                    const start = node.ratio;
                    const origin = node.axis === 'row' ? event.clientX : event.clientY;
                    const move = current => commit(tree => updateSplit(tree, path, start + ((node.axis === 'row' ? current.clientX : current.clientY) - origin) / (node.axis === 'row' ? rect.width : rect.height)));
                    const end = () => {
                        window.removeEventListener('pointermove', move);
                        window.removeEventListener('pointerup', end);
                        window.removeEventListener('pointercancel', end);
                    };
                    window.addEventListener('pointermove', move);
                    window.addEventListener('pointerup', end);
                    window.addEventListener('pointercancel', end);
                }
            }),
            jsx('div', { className: 'workspace-split-child', style: { flexGrow: 1 - node.ratio } }, renderNode(node.second, [...path, 'second']))
        );
    };

    return jsx('div', { className: 'native-floating-app', 'data-floating-id': id },
        root ? renderNode(root) : jsx('div', { className: 'workspace-empty' }, 'Loading tool panels…')
    );
}
