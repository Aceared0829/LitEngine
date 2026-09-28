import { createPortal } from 'react-dom';
import { useLayoutEffect, useState } from 'react';

import { jsx } from '../jsx.mjs';
import { isDesktopEditor } from '../platform/desktop-api.mjs';
import { PANEL_IDS, PANEL_LABELS, panelIdsInNode, resizeFloatingBounds } from './layout-preferences.mjs';
import { HierarchyPanel } from './HierarchyPanel.mjs';
import { InspectorPanel } from './InspectorPanel.mjs';
import { Viewport } from './Viewport.mjs';

const MIN_DRAG_DISTANCE = 6;
const FLOAT_RESIZE_EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/**
 * @param {DOMRect} rect - Target panel rectangle.
 * @param {number} x - Pointer X.
 * @param {number} y - Pointer Y.
 * @returns {import('./layout-preferences.mjs').DropPosition} Closest side, or the tab center.
 */
export const dropPositionAt = (rect, x, y) => {
    if (y - rect.top <= 35) {
        return 'center';
    }
    const distances = [
        ['left', (x - rect.left) / rect.width],
        ['right', (rect.right - x) / rect.width],
        ['top', (y - rect.top) / rect.height],
        ['bottom', (rect.bottom - y) / rect.height]
    ];
    const [position, distance] = distances.reduce((nearest, item) => (item[1] < nearest[1] ? item : nearest));
    return distance < 0.28 ? position : 'center';
};

/**
 * Renders nested splits and keeps panel content mounted while surfaces are rearranged.
 *
 * @param {object} props - Workspace layout and actions.
 * @param {import('react').RefObject<HTMLElement | null>} props.workspaceRef - Workspace root.
 * @param {import('react').RefObject<HTMLCanvasElement | null>} props.canvasRef - Viewport canvas.
 * @param {import('../domain/editor-reducer.mjs').EditorState} props.state - Editor state.
 * @param {(command: import('../contracts/editor-contracts.mjs').EditorCommand) => void} props.dispatch - Command dispatcher.
 * @param {import('./layout-preferences.mjs').WorkspaceLayout} props.layout - Workspace layout.
 * @param {(id: import('./layout-preferences.mjs').PanelId, targetId: import('./layout-preferences.mjs').PanelId | null, position: import('./layout-preferences.mjs').DropPosition) => void} props.dock - Dock panel action.
 * @param {(id: import('./layout-preferences.mjs').PanelId, geometry: object) => void} props.float - Float panel action.
 * @param {(id: import('./layout-preferences.mjs').PanelId) => void} props.hide - Hide panel action.
 * @param {(id: 'hierarchy'|'inspector') => void} props.openExternal - Open a native tool window.
 * @param {(item: import('./layout-preferences.mjs').FloatingWindow, position: {screenX: number, screenY: number}) => void} props.openExternalFloat - Open a complete native floating group.
 * @param {(id: import('./layout-preferences.mjs').PanelId) => void} props.activate - Activate panel tab.
 * @param {(floatId: string | null, path: string[], ratio: number) => void} props.resize - Resize a split.
 * @param {(id: string, geometry: object) => void} props.updateFloat - Update floating geometry.
 * @param {(id: string) => void} props.closeFloat - Close a floating surface.
 * @param {(id: string) => void} props.raiseFloat - Raise floating surface.
 * @param {boolean} props.showHelp - Viewport help visibility.
 * @param {(visible: boolean) => void} props.setShowHelp - Set viewport help visibility.
 */
export function WorkspacePanels({ workspaceRef, canvasRef, state, dispatch, layout, dock, float, hide, openExternal, openExternalFloat, activate, resize, updateFloat, closeFloat, raiseFloat, showHelp, setShowHelp }) {
    const [drag, setDrag] = useState(null);
    const [hosts] = useState(() => Object.fromEntries(PANEL_IDS.map((id) => {
        const element = document.createElement('div');
        element.className = 'workspace-panel-host';
        return [id, element];
    })));

    // Moving a host preserves its React portal, canvas context, and panel-local state.
    useLayoutEffect(() => {
        const body = workspaceRef.current?.querySelector('.workspace-body');
        const parking = body?.querySelector('.workspace-parking');
        if (!body || !parking) {
            return;
        }
        for (const id of PANEL_IDS) {
            const slot = body.querySelector(`[data-panel-slot="${id}"]:not([hidden])`) ?? parking;
            if (hosts[id].parentElement !== slot) {
                slot.appendChild(hosts[id]);
            }
        }
    }, [hosts, layout, workspaceRef]);

    const bodyRect = () => workspaceRef.current?.querySelector('.workspace-body')?.getBoundingClientRect();
    const outsideEditor = event => event.clientX < 0 || event.clientX >= window.innerWidth || event.clientY < 0 || event.clientY >= window.innerHeight;
    const nativePosition = (event, item) => ({
        screenX: Math.round(event.screenX - Math.min(80, item.width / 2)),
        screenY: Math.round(event.screenY - 16)
    });
    const hitTest = (x, y, id, forceFloat = false) => {
        const body = bodyRect();
        if (!body || x < body.left || x >= body.right || y < body.top || y >= body.bottom || forceFloat) {
            return id === 'viewport' ? null : { targetId: null, position: 'float', rect: null };
        }
        const group = document.elementsFromPoint(x, y)
        .map(element => element.closest('.workspace-group'))
        .find(element => element && (element.dataset.panelIds.split(',').some(panelId => panelId !== id)));
        if (!group) {
            return id === 'viewport' ? null : { targetId: null, position: 'float', rect: null };
        }
        if (id === 'viewport' && group.closest('.floating-window')) {
            return null;
        }
        const ids = group.dataset.panelIds.split(',');
        const targetId = ids.find(item => item !== id) ?? ids[0];
        const rect = group.getBoundingClientRect();
        return { targetId, position: dropPositionAt(rect, x, y), rect };
    };

    const beginDrag = (event, id) => {
        if (event.button !== 0) {
            return;
        }
        const startX = event.clientX;
        const startY = event.clientY;
        let moved = false;
        let canceled = false;
        const sourceFloat = layout.floats.find(item => item.root && item.root.type === 'tabs' && item.root.ids.length === 1 && item.root.ids[0] === id);
        const sourceRect = bodyRect();

        function cleanup() {
            document.body.classList.remove('editor-panel-dragging');
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onEnd);
            window.removeEventListener('pointercancel', onCancel);
            window.removeEventListener('keydown', onKeyDown, true);
            setDrag(null);
        }
        function onMove(moveEvent) {
            if (!moved && Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) >= MIN_DRAG_DISTANCE) {
                moved = true;
                document.body.classList.add('editor-panel-dragging');
            }
            if (moved) {
                if (sourceFloat) {
                    updateFloat(sourceFloat.id, {
                        x: sourceFloat.x + moveEvent.clientX - startX,
                        y: sourceFloat.y + moveEvent.clientY - startY
                    });
                }
                setDrag({ id, hit: hitTest(moveEvent.clientX, moveEvent.clientY, id, moveEvent.altKey), x: moveEvent.clientX, y: moveEvent.clientY });
            }
        }
        function onEnd(endEvent) {
            if (moved && !canceled) {
                if (outsideEditor(endEvent) && isDesktopEditor() && id !== 'viewport') {
                    if (sourceFloat) {
                        openExternalFloat(sourceFloat, nativePosition(endEvent, sourceFloat));
                    } else {
                        openExternal(id);
                    }
                    cleanup();
                    return;
                }
                const hit = hitTest(endEvent.clientX, endEvent.clientY, id, endEvent.altKey);
                if (hit?.position === 'float' && id !== 'viewport') {
                    float(id, {
                        x: Math.round(sourceFloat ? sourceFloat.x + endEvent.clientX - startX : endEvent.clientX - sourceRect.left - 160),
                        y: Math.round(sourceFloat ? sourceFloat.y + endEvent.clientY - startY : endEvent.clientY - sourceRect.top - 18),
                        width: sourceFloat?.width ?? 360,
                        height: sourceFloat?.height ?? 420
                    });
                } else if (hit && hit.targetId !== id) {
                    dock(id, hit.targetId, hit.position);
                }
            }
            cleanup();
        }
        function onCancel() {
            canceled = true;
            if (sourceFloat && moved) {
                updateFloat(sourceFloat.id, { x: sourceFloat.x, y: sourceFloat.y });
            }
            cleanup();
        }
        function onKeyDown(keyEvent) {
            if (keyEvent.key === 'Escape') {
                keyEvent.preventDefault();
                keyEvent.stopImmediatePropagation();
                onCancel();
            }
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onEnd);
        window.addEventListener('pointercancel', onCancel);
        window.addEventListener('keydown', onKeyDown, true);
    };

    const beginResize = (event, onMove, onEnd = null) => {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        const startX = event.clientX;
        const startY = event.clientY;
        const move = current => onMove(current.clientX - startX, current.clientY - startY);
        const end = (endEvent) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
            if (endEvent.type === 'pointerup') {
                onEnd?.(endEvent);
            }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
    };

    const beginMoveFloat = (event, item) => {
        if (item.maximized) {
            return;
        }
        const { x, y } = item;
        beginResize(event, (dx, dy) => updateFloat(item.id, { x: x + dx, y: y + dy }), (endEvent) => {
            if (outsideEditor(endEvent) && isDesktopEditor()) {
                openExternalFloat(item, nativePosition(endEvent, item));
            }
        });
    };

    const renderTree = (node, path = [], floatId = null) => {
        if (!node) {
            return jsx('div', { className: 'workspace-empty' }, 'Use Window to reopen a panel');
        }
        if (node.type === 'tabs') {
            return jsx('section', {
                className: 'workspace-group',
                'aria-label': `${PANEL_LABELS[node.active]} panel group`,
                'data-panel-ids': node.ids.join(',')
            },
            jsx('div', {
                className: 'workspace-tabs',
                role: 'tablist',
                'aria-label': 'Panel tabs',
                onPointerDown: (event) => {
                    if (event.target === event.currentTarget) {
                        const floatingWindow = layout.floats.find(item => item.id === floatId);
                        if (floatingWindow) {
                            beginMoveFloat(event, floatingWindow);
                        } else {
                            beginDrag(event, node.active);
                        }
                    }
                },
                onDoubleClick: (event) => {
                    if (event.target === event.currentTarget && floatId) {
                        const floatingWindow = layout.floats.find(item => item.id === floatId);
                        updateFloat(floatId, { maximized: !floatingWindow.maximized, minimized: false });
                    }
                }
            },
            ...node.ids.map(id => jsx('div', { className: `workspace-tab ${node.active === id ? 'is-active' : ''}`, key: id },
                jsx('button', {
                    type: 'button',
                    role: 'tab',
                    'aria-selected': node.active === id,
                    className: 'workspace-tab-title',
                    title: `Drag ${PANEL_LABELS[id]} onto another panel; Alt+drag or drag outside to float`,
                    onPointerDown: event => beginDrag(event, id),
                    onDoubleClick: () => {
                        if (floatId) {
                            const floatingWindow = layout.floats.find(item => item.id === floatId);
                            updateFloat(floatId, { maximized: !floatingWindow.maximized, minimized: false });
                        }
                    },
                    onClick: () => activate(id)
                }, PANEL_LABELS[id]),
                id !== 'viewport' && isDesktopEditor() && jsx('button', {
                    type: 'button',
                    className: 'panel-popout',
                    'aria-label': `Open ${PANEL_LABELS[id]} in new window`,
                    title: 'Open in new window',
                    onClick: () => openExternal(id)
                }, '↗'),
                id !== 'viewport' && jsx('button', {
                    type: 'button',
                    className: 'panel-close',
                    'aria-label': `Close ${PANEL_LABELS[id]} panel`,
                    title: 'Close panel',
                    onClick: () => hide(id)
                }, '×')
            ))
            ),
            ...node.ids.map(id => jsx('div', {
                className: `workspace-content ${id === 'viewport' ? 'workspace-content-viewport' : ''}`,
                role: 'tabpanel',
                hidden: node.active !== id,
                key: id,
                'data-panel-slot': id
            }))
            );
        }
        return jsx('div', { className: `workspace-split workspace-split-${node.axis}` },
            jsx('div', { className: 'workspace-split-child', style: { flexGrow: node.ratio } }, renderTree(node.first, [...path, 'first'], floatId)),
            jsx('button', {
                type: 'button',
                className: 'workspace-split-gutter',
                'aria-label': `Resize ${node.axis === 'row' ? 'horizontal' : 'vertical'} panel split`,
                onPointerDown: (event) => {
                    const rect = event.currentTarget.parentElement.getBoundingClientRect();
                    const startRatio = node.ratio;
                    beginResize(event, (dx, dy) => resize(floatId, path, startRatio + (node.axis === 'row' ? dx / rect.width : dy / rect.height)));
                },
                onDoubleClick: () => resize(floatId, path, 0.5)
            }),
            jsx('div', { className: 'workspace-split-child', style: { flexGrow: 1 - node.ratio } }, renderTree(node.second, [...path, 'second'], floatId))
        );
    };

    const renderFloat = item => jsx('section', {
        className: `floating-window${item.minimized ? ' is-minimized' : ''}${item.maximized ? ' is-maximized' : ''}`,
        key: item.id,
        'aria-label': `Floating ${panelIdsInNode(item.root).map(id => PANEL_LABELS[id]).join(', ')} window`,
        style: item.maximized ? { left: 0, top: 0, width: '100%', height: '100%' } : {
            left: item.x, top: item.y, width: item.width, height: item.minimized ? 34 : item.height
        },
        onPointerDown: () => {
            if (layout.floats.at(-1)?.id !== item.id) {
                raiseFloat(item.id);
            }
        }
    },
    item.minimized && jsx('div', {
        className: 'floating-window-minimized-title',
        onPointerDown: event => beginMoveFloat(event, item)
    }, panelIdsInNode(item.root).map(id => PANEL_LABELS[id]).join(' · ')),
    jsx('div', { className: 'floating-window-content' }, renderTree(item.root, [], item.id)),
    jsx('div', { className: 'floating-window-controls' },
        isDesktopEditor() && jsx('button', {
            type: 'button',
            'aria-label': 'Open floating group in new window',
            title: 'Open complete group in a separate window',
            onClick: event => openExternalFloat(item, nativePosition(event, item))
        }, '↗'),
        jsx('button', {
            type: 'button',
            'aria-label': item.minimized ? 'Restore floating window' : 'Minimize floating window',
            title: item.minimized ? 'Restore' : 'Minimize',
            onClick: () => updateFloat(item.id, { minimized: !item.minimized, maximized: false })
        }, item.minimized ? '▢' : '−'),
        jsx('button', {
            type: 'button',
            'aria-label': item.maximized ? 'Restore floating window' : 'Maximize floating window',
            title: item.maximized ? 'Restore' : 'Maximize',
            onClick: () => updateFloat(item.id, { maximized: !item.maximized, minimized: false })
        }, item.maximized ? '❐' : '□'),
        jsx('button', {
            type: 'button',
            className: 'floating-window-close',
            'aria-label': 'Close floating window',
            title: 'Close window',
            onClick: () => closeFloat(item.id)
        }, '×')
    ),
    ...(!item.minimized && !item.maximized ? FLOAT_RESIZE_EDGES.map(edges => jsx('button', {
        type: 'button',
        key: edges,
        className: `floating-window-resize floating-window-resize-${edges}`,
        'aria-label': `Resize floating window from ${edges} edge`,
        onPointerDown: (event) => {
            const body = bodyRect();
            beginResize(event, (dx, dy) => updateFloat(item.id, resizeFloatingBounds(item, edges, dx, dy, body.width, body.height)));
        }
    })) : []));

    const preview = drag?.hit?.rect && (() => {
        const rect = drag.hit.rect;
        const body = bodyRect();
        const position = drag.hit.position;
        const width = position === 'left' || position === 'right' ? rect.width * 0.42 : rect.width;
        const height = position === 'top' || position === 'bottom' ? rect.height * 0.42 : rect.height;
        return jsx('div', {
            className: `workspace-drop-preview workspace-drop-${position}`,
            style: {
                left: rect.left - body.left + (position === 'right' ? rect.width - width : 0),
                top: rect.top - body.top + (position === 'bottom' ? rect.height - height : 0),
                width,
                height
            }
        }, position === 'center' ? 'Add as tab' : `Dock ${position}`);
    })();

    return jsx('div', { className: 'workspace-body' },
        jsx('div', { className: 'workspace-main' }, renderTree(layout.root)),
        jsx('div', { className: 'floating-layer' }, ...layout.floats.map(renderFloat)),
        jsx('div', { className: 'workspace-parking', 'aria-hidden': true }),
        drag && jsx('div', { className: 'workspace-drag-layer', 'aria-hidden': true },
            preview,
            jsx('div', { className: 'workspace-drag-label', style: { left: drag.x - bodyRect().left + 14, top: drag.y - bodyRect().top + 14 } },
                drag.hit?.position === 'float' ? `Float ${PANEL_LABELS[drag.id]}` : PANEL_LABELS[drag.id])
        ),
        createPortal(jsx(HierarchyPanel, { state, dispatch, ready: state.runtimeStatus === 'ready', collapsed: false }), hosts.hierarchy),
        createPortal(jsx(Viewport, { canvasRef, state, dispatch, showHelp, setShowHelp }), hosts.viewport),
        createPortal(jsx(InspectorPanel, { state, dispatch, ready: state.runtimeStatus === 'ready', collapsed: false }), hosts.inspector)
    );
}
