import { jsx } from '../jsx.mjs';

/**
 * @param {{ state: import('../domain/editor-reducer.mjs').EditorState }} props - Status props.
 */
export function StatusBar({ state }) {
    const selected = state.scene.entities.find(entity => entity.id === state.selectedEntityId);
    const effectiveSpace = state.activeTool === 'scale' ? 'local' : state.coordinateSpace;
    const runtimeLabel = state.runtimeStatus === 'ready' ? 'Runtime ready' : state.runtimeStatus === 'error' ? 'Runtime error' : 'Runtime loading';
    const snapTool = state.activeTool === 'select' ? 'translate' : state.activeTool;
    const snapIncrement = state.snap[`${snapTool}Increment`];

    return jsx(
        'footer',
        { className: `editor-status-bar status-${state.runtimeStatus}` },
        jsx('span', { className: 'status-runtime' }, `● ${runtimeLabel}`),
        jsx('span', { className: 'status-message' }, state.statusMessage),
        jsx('span', null, `Tool: ${state.activeTool}`),
        jsx('span', null, `Space: ${effectiveSpace}`),
        jsx('span', { className: state.snap.enabled ? 'status-snap is-enabled' : 'status-snap' }, `Snap: ${state.snap.enabled ? snapIncrement : 'off'}`),
        jsx('span', { className: 'status-selection' }, selected ? `Selected: ${selected.name}` : 'No selection')
    );
}
