const STORAGE_KEY = 'lit-engine-editor.workspace.v1';
const DEFAULT_LAYOUT = {
    hierarchyWidth: 252,
    inspectorWidth: 312,
    hierarchyCollapsed: false,
    inspectorCollapsed: false
};

/**
 * @typedef {typeof DEFAULT_LAYOUT} WorkspaceLayout
 */

/**
 * @param {number} value - Candidate dock width.
 * @param {number} min - Lower bound.
 * @param {number} max - Upper bound.
 * @returns {number} Clamped finite dock width.
 */
export const clampDockWidth = (value, min, max) => {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
};

/**
 * @param {unknown} value - Persisted layout candidate.
 * @param {number} availableWidth - Editor container width.
 * @returns {WorkspaceLayout} Safe layout state.
 */
export const normalizeWorkspaceLayout = (value, availableWidth) => {
    const layout = typeof value === 'object' && value ? value : {};
    const maxCombined = Math.max(420, availableWidth - 460);
    const hierarchyMax = Math.max(180, Math.min(480, maxCombined - 230));
    const hierarchyWidth = clampDockWidth(layout.hierarchyWidth, 180, hierarchyMax);
    const inspectorMax = Math.max(230, Math.min(540, maxCombined - hierarchyWidth));
    const inspectorWidth = clampDockWidth(layout.inspectorWidth, 230, inspectorMax);
    return {
        hierarchyWidth,
        inspectorWidth,
        hierarchyCollapsed: Boolean(layout.hierarchyCollapsed),
        inspectorCollapsed: Boolean(layout.inspectorCollapsed)
    };
};

/**
 * @returns {WorkspaceLayout} Layout restored from local preferences.
 */
export const readWorkspaceLayout = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
        return { ...DEFAULT_LAYOUT, ...parsed };
    } catch {
        return { ...DEFAULT_LAYOUT };
    }
};

/**
 * @param {WorkspaceLayout} layout - Layout to persist.
 */
export const writeWorkspaceLayout = (layout) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
        // A full or unavailable local store must not block the editor.
    }
};

export { DEFAULT_LAYOUT };
