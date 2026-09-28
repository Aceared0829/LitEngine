const STORAGE_KEY = 'lit-engine-editor.workspace.v3';
const LEGACY_KEYS = ['lit-engine-editor.workspace.v2', 'lit-engine-editor.workspace.v1'];

export const PANEL_IDS = ['hierarchy', 'viewport', 'inspector'];
export const PANEL_LABELS = { hierarchy: 'Scene Outliner', viewport: 'Viewport', inspector: 'Inspector' };

/** @typedef {'hierarchy'|'viewport'|'inspector'} PanelId */
/** @typedef {'left'|'right'|'top'|'bottom'|'center'} DropPosition */
/** @typedef {{ type: 'tabs', ids: PanelId[], active: PanelId }} TabNode */
/** @typedef {{ type: 'split', axis: 'row'|'column', ratio: number, first: LayoutNode, second: LayoutNode }} SplitNode */
/** @typedef {TabNode | SplitNode} LayoutNode */
/** @typedef {{ id: string, root: LayoutNode, x: number, y: number, width: number, height: number, minimized: boolean, maximized: boolean }} FloatingWindow */
/** @typedef {FloatingWindow & { screenX: number, screenY: number }} ExternalGroup */
/** @typedef {{ root: LayoutNode | null, floats: FloatingWindow[], hidden: PanelId[], external: PanelId[], externalGroups: ExternalGroup[] }} WorkspaceLayout */

const tabs = id => ({ type: 'tabs', ids: [id], active: id });
const split = (axis, ratio, first, second) => ({ type: 'split', axis, ratio, first, second });

export const DEFAULT_LAYOUT = {
    root: split('row', 0.18, tabs('hierarchy'), split('row', 0.73, tabs('viewport'), tabs('inspector'))),
    floats: [],
    hidden: [],
    external: [],
    externalGroups: []
};

/**
 * @param {number} value - Candidate number.
 * @param {number} min - Lower bound.
 * @param {number} max - Upper bound.
 * @returns {number} Finite number within bounds.
 */
export const clampDockWidth = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const normalizeNode = (value, seen) => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    if (value.type === 'tabs' && Array.isArray(value.ids)) {
        const ids = value.ids.filter(id => PANEL_IDS.includes(id) && !seen.has(id) && seen.add(id));
        return ids.length ? { type: 'tabs', ids, active: ids.includes(value.active) ? value.active : ids[0] } : null;
    }
    if (value.type === 'split' && ['row', 'column'].includes(value.axis)) {
        const first = normalizeNode(value.first, seen);
        const second = normalizeNode(value.second, seen);
        if (!first || !second) {
            return first ?? second;
        }
        return split(value.axis, clampDockWidth(value.ratio, 0.12, 0.88), first, second);
    }
    return null;
};

/**
 * @param {LayoutNode | null} node - Layout subtree.
 * @param {PanelId} id - Panel to find.
 * @returns {boolean} Whether the subtree contains the panel.
 */
export const containsPanel = (node, id) => Boolean(node && (node.type === 'tabs' ? node.ids.includes(id) : containsPanel(node.first, id) || containsPanel(node.second, id)));

/**
 * @param {LayoutNode | null} node - Panel subtree.
 * @returns {PanelId[]} Every panel in the subtree.
 */
export const panelIdsInNode = node => (!node ? [] : node.type === 'tabs' ? node.ids : [...panelIdsInNode(node.first), ...panelIdsInNode(node.second)]);

/**
 * Resize one side or corner while anchoring the opposite edges inside the workspace.
 *
 * @param {FloatingWindow} window - Current floating window.
 * @param {string} edges - Combination of n, s, e and w.
 * @param {number} dx - Horizontal pointer movement.
 * @param {number} dy - Vertical pointer movement.
 * @param {number} availableWidth - Workspace width.
 * @param {number} availableHeight - Workspace height.
 * @returns {{ x: number, y: number, width: number, height: number }} Resized bounds.
 */
export const resizeFloatingBounds = (window, edges, dx, dy, availableWidth, availableHeight) => {
    let { x, y, width, height } = window;
    const minWidth = Math.min(240, availableWidth);
    const minHeight = Math.min(180, availableHeight);
    if (edges.includes('w')) {
        const right = x + width;
        x = clampDockWidth(x + dx, 0, right - minWidth);
        width = right - x;
    } else if (edges.includes('e')) {
        width = clampDockWidth(width + dx, minWidth, availableWidth - x);
    }
    if (edges.includes('n')) {
        const bottom = y + height;
        y = clampDockWidth(y + dy, 0, bottom - minHeight);
        height = bottom - y;
    } else if (edges.includes('s')) {
        height = clampDockWidth(height + dy, minHeight, availableHeight - y);
    }
    return { x, y, width, height };
};

const removeFromNode = (node, id) => {
    if (!node) {
        return null;
    }
    if (node.type === 'tabs') {
        const ids = node.ids.filter(item => item !== id);
        return ids.length ? { ...node, ids, active: ids.includes(node.active) ? node.active : ids[0] } : null;
    }
    const first = removeFromNode(node.first, id);
    const second = removeFromNode(node.second, id);
    return first && second ? { ...node, first, second } : (first ?? second);
};

/**
 * Validates the tree and guarantees each panel belongs to one surface or is hidden.
 *
 * @param {unknown} value - Saved layout candidate.
 * @param {number} availableWidth - Workspace width.
 * @param {number} availableHeight - Workspace height.
 * @returns {WorkspaceLayout} Safe layout state.
 */
export const normalizeWorkspaceLayout = (value, availableWidth = 1440, availableHeight = 830) => {
    const candidate = value && typeof value === 'object' ? value : DEFAULT_LAYOUT;
    const seen = new Set();
    const surfaceIds = new Set();
    const uniqueSurfaceId = (value, fallback) => {
        const base = typeof value === 'string' && value ? value : fallback;
        let id = base;
        let suffix = 2;
        while (surfaceIds.has(id)) {
            id = `${base}-${suffix++}`;
        }
        surfaceIds.add(id);
        return id;
    };
    let root = normalizeNode(candidate.root, seen);
    let floats = [];
    if (Array.isArray(candidate.floats)) {
        for (const item of candidate.floats) {
            const floatRoot = normalizeNode(item?.root, seen);
            if (!floatRoot) {
                continue;
            }
            const width = clampDockWidth(item.width, 240, Math.max(240, availableWidth - 16));
            const height = clampDockWidth(item.height, 180, Math.max(180, availableHeight - 16));
            floats.push({
                id: uniqueSurfaceId(item.id, `float-${floats.length}`),
                root: floatRoot,
                x: clampDockWidth(item.x, 0, Math.max(0, availableWidth - width)),
                y: clampDockWidth(item.y, 0, Math.max(0, availableHeight - height)),
                width,
                height,
                minimized: item.minimized === true,
                maximized: item.maximized === true && item.minimized !== true
            });
        }
    }
    if (!containsPanel(root, 'viewport')) {
        floats = floats.map(item => ({ ...item, root: removeFromNode(item.root, 'viewport') })).filter(item => item.root);
        root = root ? split('row', 0.5, root, tabs('viewport')) : tabs('viewport');
        seen.add('viewport');
    }
    const externalGroups = [];
    if (Array.isArray(candidate.externalGroups)) {
        for (const item of candidate.externalGroups) {
            const groupRoot = normalizeNode(item?.root, seen);
            if (!groupRoot || containsPanel(groupRoot, 'viewport')) {
                continue;
            }
            externalGroups.push({
                id: uniqueSurfaceId(item.id, `external-${externalGroups.length}`),
                root: groupRoot,
                x: Number.isFinite(item.x) ? item.x : 80,
                y: Number.isFinite(item.y) ? item.y : 70,
                width: clampDockWidth(item.width, 240, 4000),
                height: clampDockWidth(item.height, 180, 4000),
                minimized: false,
                maximized: false,
                screenX: Number.isFinite(item.screenX) ? item.screenX : 100,
                screenY: Number.isFinite(item.screenY) ? item.screenY : 100
            });
        }
    }
    const external = (Array.isArray(candidate.external) ? candidate.external : [])
    .filter((id, index, list) => id !== 'viewport' && PANEL_IDS.includes(id) && !seen.has(id) && list.indexOf(id) === index);
    return { root, floats, externalGroups, external, hidden: PANEL_IDS.filter(id => !seen.has(id) && !external.includes(id)) };
};

const detachPanel = (layout, id) => ({
    ...layout,
    root: removeFromNode(layout.root, id),
    floats: layout.floats.map(item => ({ ...item, root: removeFromNode(item.root, id) })).filter(item => item.root),
    hidden: layout.hidden.filter(item => item !== id),
    external: layout.external.filter(item => item !== id)
});

const insertIntoNode = (node, id, targetId, position) => {
    if (node.type === 'tabs') {
        if (!node.ids.includes(targetId)) {
            return node;
        }
        if (position === 'center') {
            return { ...node, ids: [...node.ids, id], active: id };
        }
        const horizontal = position === 'left' || position === 'right';
        const before = position === 'left' || position === 'top';
        return split(horizontal ? 'row' : 'column', 0.5, before ? tabs(id) : node, before ? node : tabs(id));
    }
    if (containsPanel(node.first, targetId)) {
        return { ...node, first: insertIntoNode(node.first, id, targetId, position) };
    }
    return { ...node, second: insertIntoNode(node.second, id, targetId, position) };
};

/**
 * Docks a panel at any side of another panel, or groups both as tabs in the center.
 *
 * @param {WorkspaceLayout} layout - Current layout.
 * @param {PanelId} id - Panel to move.
 * @param {PanelId | null} targetId - Target panel, or null for an empty workspace.
 * @param {DropPosition} position - Relative drop position.
 * @returns {WorkspaceLayout} Updated layout.
 */
export const dockPanel = (layout, id, targetId, position) => {
    if (id === targetId) {
        return layout;
    }
    if (id === 'viewport' && layout.floats.some(item => containsPanel(item.root, targetId))) {
        return layout;
    }
    const detached = detachPanel(layout, id);
    if (targetId && containsPanel(detached.root, targetId)) {
        return { ...detached, root: insertIntoNode(detached.root, id, targetId, position) };
    }
    if (targetId) {
        const floats = detached.floats.map(item => (containsPanel(item.root, targetId) ?
            { ...item, root: insertIntoNode(item.root, id, targetId, position) } : item));
        if (floats.some(item => containsPanel(item.root, id))) {
            return { ...detached, floats };
        }
    }
    return { ...detached, root: detached.root ? split('row', 0.72, detached.root, tabs(id)) : tabs(id) };
};

/**
 * @param {WorkspaceLayout} layout - Current layout.
 * @param {PanelId} id - Panel to float.
 * @param {Partial<FloatingWindow>} geometry - Requested window geometry.
 * @returns {WorkspaceLayout} Updated layout.
 */
export const floatPanel = (layout, id, geometry = {}) => {
    if (id === 'viewport') {
        return layout;
    }
    const existing = layout.floats.find(item => containsPanel(item.root, id) && item.root.type === 'tabs' && item.root.ids.length === 1);
    if (existing) {
        return { ...layout, floats: [...layout.floats.filter(item => item !== existing), { ...existing, ...geometry }] };
    }
    const detached = detachPanel(layout, id);
    const baseId = `float-${id}`;
    const occupiedIds = new Set([...detached.floats, ...detached.externalGroups].map(item => item.id));
    let floatId = baseId;
    let suffix = 2;
    while (occupiedIds.has(floatId)) {
        floatId = `${baseId}-${suffix++}`;
    }
    return {
        ...detached,
        floats: [...detached.floats, { id: floatId, root: tabs(id), x: geometry.x ?? 80, y: geometry.y ?? 70, width: geometry.width ?? 340, height: geometry.height ?? 420, minimized: false, maximized: false }]
    };
};

/**
 * @param {WorkspaceLayout} layout - Current layout.
 * @param {PanelId} id - Panel to hide.
 * @returns {WorkspaceLayout} Updated layout.
 */
export const hidePanel = (layout, id) => {
    if (id === 'viewport') {
        return layout;
    }
    const detached = detachPanel(layout, id);
    return { ...detached, hidden: [...detached.hidden, id] };
};

/**
 * Close a floating surface and hide all its tool panels for reopening from Window.
 *
 * @param {WorkspaceLayout} layout - Current layout.
 * @param {string} floatId - Floating surface ID.
 * @returns {WorkspaceLayout} Updated layout.
 */
export const closeFloatingWindow = (layout, floatId) => {
    const window = layout.floats.find(item => item.id === floatId);
    return window ? panelIdsInNode(window.root).reduce((current, id) => hidePanel(current, id), layout) : layout;
};

/**
 * Transfer a complete floating group to a native desktop window.
 *
 * @param {WorkspaceLayout} layout - Current layout.
 * @param {string} floatId - Floating surface ID.
 * @param {{ screenX: number, screenY: number }} screenPosition - Native window origin.
 * @returns {WorkspaceLayout} Updated layout.
 */
export const externalizeFloatingWindow = (layout, floatId, screenPosition) => {
    const window = layout.floats.find(item => item.id === floatId);
    if (!window || containsPanel(window.root, 'viewport')) {
        return layout;
    }
    return {
        ...layout,
        floats: layout.floats.filter(item => item.id !== floatId),
        externalGroups: [...layout.externalGroups, { ...window, ...screenPosition, minimized: false, maximized: false }]
    };
};

/**
 * Restore a native group as one floating surface without separating its panels.
 *
 * @param {WorkspaceLayout} layout - Current layout.
 * @param {string} floatId - Native group ID.
 * @returns {WorkspaceLayout} Updated layout.
 */
export const restoreExternalGroup = (layout, floatId) => {
    const group = layout.externalGroups.find(item => item.id === floatId);
    if (!group) {
        return layout;
    }
    const window = {
        id: group.id,
        root: group.root,
        x: group.x,
        y: group.y,
        width: group.width,
        height: group.height,
        minimized: false,
        maximized: false
    };
    return {
        ...layout,
        externalGroups: layout.externalGroups.filter(item => item.id !== floatId),
        floats: [...layout.floats, window]
    };
};

/**
 * Removes a tool panel from the main workspace after its native window opens.
 *
 * @param {WorkspaceLayout} layout - Current layout.
 * @param {PanelId} id - Panel to open externally.
 * @returns {WorkspaceLayout} Updated layout.
 */
export const externalizePanel = (layout, id) => {
    if (id === 'viewport') {
        return layout;
    }
    const detached = detachPanel(layout, id);
    return { ...detached, external: [...detached.external, id] };
};

/**
 * @param {WorkspaceLayout} layout - Current layout.
 * @param {PanelId} id - External panel returning to the editor.
 * @returns {WorkspaceLayout} Updated layout.
 */
export const restoreExternalPanel = (layout, id) => {
    if (!layout.external.includes(id)) {
        return layout;
    }
    return dockPanel(layout, id, 'viewport', 'right');
};

/**
 * @param {WorkspaceLayout} layout - Current layout.
 * @param {PanelId} id - Panel to show.
 * @returns {WorkspaceLayout} Updated layout.
 */
export const showPanel = (layout, id) => {
    if (!layout.hidden.includes(id)) {
        return layout;
    }
    const target = PANEL_IDS.find(item => item !== id && containsPanel(layout.root, item)) ?? null;
    return dockPanel(layout, id, target, id === 'viewport' ? 'center' : 'right');
};

const mapNode = (node, predicate, transform) => {
    if (!node) {
        return null;
    }
    if (predicate(node)) {
        return transform(node);
    }
    if (node.type === 'split') {
        return { ...node, first: mapNode(node.first, predicate, transform), second: mapNode(node.second, predicate, transform) };
    }
    return node;
};

/**
 * @param {WorkspaceLayout} layout - Current layout.
 * @param {PanelId} id - Tab to activate.
 * @returns {WorkspaceLayout} Updated layout.
 */
export const activatePanel = (layout, id) => ({
    ...layout,
    root: mapNode(layout.root, node => node.type === 'tabs' && node.ids.includes(id), node => ({ ...node, active: id })),
    floats: layout.floats.map(item => ({ ...item, root: mapNode(item.root, node => node.type === 'tabs' && node.ids.includes(id), node => ({ ...node, active: id })) }))
});

const updateSplitAtPath = (node, path, ratio) => {
    if (!node || node.type !== 'split') {
        return node;
    }
    if (!path.length) {
        return { ...node, ratio: clampDockWidth(ratio, 0.12, 0.88) };
    }
    const [side, ...rest] = path;
    return { ...node, [side]: updateSplitAtPath(node[side], rest, ratio) };
};

/**
 * @param {WorkspaceLayout} layout - Current layout.
 * @param {string | null} floatId - Floating surface id, or null for the main dock.
 * @param {('first'|'second')[]} path - Split path.
 * @param {number} ratio - First child fraction.
 * @returns {WorkspaceLayout} Updated layout.
 */
export const resizeSplit = (layout, floatId, path, ratio) => (floatId ? {
    ...layout,
    floats: layout.floats.map(item => (item.id === floatId ? { ...item, root: updateSplitAtPath(item.root, path, ratio) } : item))
} : { ...layout, root: updateSplitAtPath(layout.root, path, ratio) });

const migrateV2 = (old) => {
    let layout = normalizeWorkspaceLayout(DEFAULT_LAYOUT);
    for (const id of ['hierarchy', 'inspector']) {
        const panel = old.panels?.[id];
        if (panel?.place === 'hidden') {
            layout = hidePanel(layout, id);
        } else if (panel?.place === 'float') {
            layout = floatPanel(layout, id, panel);
        } else if (panel?.place === 'bottom') {
            layout = dockPanel(layout, id, 'viewport', 'bottom');
        } else if (panel?.place === 'left' && id === 'inspector') {
            layout = dockPanel(layout, id, 'hierarchy', 'center');
        } else if (panel?.place === 'right' && id === 'hierarchy') {
            layout = dockPanel(layout, id, 'inspector', 'center');
        }
    }
    return layout;
};

/**
 * @returns {WorkspaceLayout} Current, migrated, or default preferences.
 */
export const readWorkspaceLayout = () => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return normalizeWorkspaceLayout(JSON.parse(saved));
        }
        const v2 = localStorage.getItem(LEGACY_KEYS[0]);
        if (v2) {
            return normalizeWorkspaceLayout(migrateV2(JSON.parse(v2)));
        }
        const v1 = JSON.parse(localStorage.getItem(LEGACY_KEYS[1]) ?? '{}');
        if (Object.keys(v1).length) {
            let layout = normalizeWorkspaceLayout(DEFAULT_LAYOUT);
            if (v1.hierarchyCollapsed) {
                layout = hidePanel(layout, 'hierarchy');
            }
            if (v1.inspectorCollapsed) {
                layout = hidePanel(layout, 'inspector');
            }
            return layout;
        }
    } catch {
        // Bad preferences must not block editor startup.
    }
    return normalizeWorkspaceLayout(DEFAULT_LAYOUT);
};

/**
 * @param {WorkspaceLayout} layout - Layout to persist.
 */
export const writeWorkspaceLayout = (layout) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
        // Unavailable storage must not block the editor.
    }
};
