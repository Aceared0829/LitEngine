import { useEffect, useRef, useState } from 'react';

import { DEFAULT_LAYOUT, normalizeWorkspaceLayout, readWorkspaceLayout, writeWorkspaceLayout } from './layout-preferences.mjs';

/**
 * Manages desktop-only dock dimensions with container-aware bounds and persistence.
 *
 * @param {import('react').RefObject<HTMLElement | null>} containerRef - Workspace root ref.
 * @returns {{ layout: import('./layout-preferences.mjs').WorkspaceLayout, updateLayout: (update: Partial<import('./layout-preferences.mjs').WorkspaceLayout>) => void, resetDock: (dock: 'hierarchy'|'inspector') => void }} Layout API.
 */
export function useDesktopLayout(containerRef) {
    const [layout, setLayout] = useState(readWorkspaceLayout);
    const widthRef = useRef(0);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return undefined;
        }

        const observer = new ResizeObserver(([entry]) => {
            widthRef.current = entry.contentRect.width;
            setLayout(current => normalizeWorkspaceLayout(current, widthRef.current));
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, [containerRef]);

    useEffect(() => {
        writeWorkspaceLayout(layout);
    }, [layout]);

    /**
     * @param {Partial<import('./layout-preferences.mjs').WorkspaceLayout>} update - Partial logical layout update.
     */
    const updateLayout = (update) => {
        setLayout(current => normalizeWorkspaceLayout({ ...current, ...update }, widthRef.current));
    };

    /**
     * @param {'hierarchy'|'inspector'} dock - Dock to restore to its default width.
     */
    const resetDock = (dock) => {
        const key = dock === 'hierarchy' ? 'hierarchyWidth' : 'inspectorWidth';
        updateLayout({ [key]: DEFAULT_LAYOUT[key] });
    };

    return { layout, updateLayout, resetDock };
}
