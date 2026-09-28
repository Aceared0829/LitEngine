import { useEffect, useRef, useState } from 'react';

import { activatePanel, closeFloatingWindow, DEFAULT_LAYOUT, dockPanel, externalizeFloatingWindow, externalizePanel, floatPanel, hidePanel, normalizeWorkspaceLayout, readWorkspaceLayout, resizeSplit, restoreExternalGroup, restoreExternalPanel, showPanel, writeWorkspaceLayout } from './layout-preferences.mjs';

/**
 * Manages dock and floating panel geometry with container-aware bounds and persistence.
 *
 * @param {import('react').RefObject<HTMLElement | null>} containerRef - Workspace root ref.
 * @returns {object} Workspace layout actions.
 */
export function useDesktopLayout(containerRef) {
    const [layout, setLayout] = useState(readWorkspaceLayout);
    const sizeRef = useRef({ width: 1440, height: 830 });

    useEffect(() => {
        const container = containerRef.current?.querySelector('.workspace-body');
        if (!container) {
            return undefined;
        }

        const observer = new ResizeObserver(([entry]) => {
            sizeRef.current = { width: entry.contentRect.width, height: entry.contentRect.height };
            setLayout(current => normalizeWorkspaceLayout(current, sizeRef.current.width, sizeRef.current.height));
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, [containerRef]);

    useEffect(() => {
        writeWorkspaceLayout(layout);
    }, [layout]);

    const commit = transform => setLayout(current => normalizeWorkspaceLayout(transform(current), sizeRef.current.width, sizeRef.current.height));
    const dock = (id, targetId, position) => commit(current => dockPanel(current, id, targetId, position));
    const float = (id, geometry) => commit(current => floatPanel(current, id, geometry));
    const hide = id => commit(current => hidePanel(current, id));
    const show = id => commit(current => showPanel(current, id));
    const externalize = id => commit(current => externalizePanel(current, id));
    const externalizeFloat = (id, position) => commit(current => externalizeFloatingWindow(current, id, position));
    const restoreExternal = id => commit(current => restoreExternalPanel(current, id));
    const restoreExternalFloat = id => commit(current => restoreExternalGroup(current, id));
    const activate = id => commit(current => activatePanel(current, id));
    const resize = (floatId, path, ratio) => commit(current => resizeSplit(current, floatId, path, ratio));
    const updateFloat = (id, geometry) => commit(current => ({
        ...current,
        floats: current.floats.map(item => (item.id === id ? { ...item, ...geometry } : item))
    }));
    const closeFloat = id => commit(current => closeFloatingWindow(current, id));
    const updateExternalFloat = (id, geometry) => commit(current => ({
        ...current,
        externalGroups: current.externalGroups.map(item => (item.id === id ? { ...item, ...geometry } : item))
    }));
    const raiseFloat = id => commit(current => ({
        ...current,
        floats: [...current.floats.filter(item => item.id !== id), ...current.floats.filter(item => item.id === id)]
    }));

    const resetLayout = () => setLayout(normalizeWorkspaceLayout(DEFAULT_LAYOUT, sizeRef.current.width, sizeRef.current.height));

    return { layout, dock, float, hide, show, externalize, externalizeFloat, restoreExternal, restoreExternalFloat, activate, resize, updateFloat, updateExternalFloat, closeFloat, raiseFloat, resetLayout };
}
