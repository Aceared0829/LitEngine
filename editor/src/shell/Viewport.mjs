import { Button } from '@playcanvas/pcui/react';
import { useState } from 'react';

import { jsx } from '../jsx.mjs';

/**
 * @param {{ canvasRef: import('react').RefObject<HTMLCanvasElement | null>, state: import('../domain/editor-reducer.mjs').EditorState, dispatch: (command: import('../contracts/editor-contracts.mjs').EditorCommand) => void }} props - Viewport props.
 */
export function Viewport({ canvasRef, state, dispatch }) {
    const [showHelp, setShowHelp] = useState(false);
    const effectiveSpace = state.activeTool === 'scale' ? 'local' : state.coordinateSpace;

    return jsx(
        'main',
        { className: 'editor-viewport', 'aria-label': '3D viewport' },
        jsx('canvas', { ref: canvasRef, className: 'viewport-canvas', tabIndex: 0, 'aria-label': 'Interactive 3D scene viewport' }),
        state.runtimeStatus !== 'ready' && jsx(
            'div',
            { className: `viewport-overlay ${state.runtimeStatus === 'error' ? 'viewport-error' : ''}` },
            state.runtimeStatus === 'error' ? state.error : '正在初始化本地 3D 视口…'
        ),
        jsx('div', { className: 'viewport-chrome viewport-toolbar' },
            jsx('span', { className: 'viewport-mode' }, state.activeTool === 'select' ? 'Select' : state.activeTool),
            jsx('span', { className: 'viewport-separator' }),
            jsx('span', null, effectiveSpace === 'world' ? 'World' : 'Local'),
            jsx('span', { className: 'viewport-separator' }),
            jsx('span', { className: state.snap.enabled ? 'snap-indicator is-enabled' : 'snap-indicator' }, `Snap ${state.snap.enabled ? 'On' : 'Off'}`),
            jsx('span', { className: 'viewport-chrome-spacer' }),
            jsx(Button, {
                className: 'viewport-help-button',
                text: '?',
                tooltip: 'Viewport navigation help',
                onClick: () => setShowHelp(!showHelp)
            })
        ),
        showHelp && jsx('div', { className: 'viewport-help-card', role: 'dialog', 'aria-label': 'Viewport navigation help' },
            jsx('strong', null, 'Viewport navigation'),
            jsx('p', null, 'Click select · drag LMB orbit · MMB / Shift+LMB pan · wheel zoom'),
            jsx('p', null, 'Hold RMB for fly look · WASD / arrows move · Q/E vertical move'),
            jsx('p', null, 'Q/W/E/R tools · F frame selected · Shift+F frame all · Esc clear selection')
        ),
        jsx('div', { className: 'viewport-hint' }, 'Click to select · drag to orbit · F to frame')
    );
}
