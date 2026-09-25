import { Button } from '@playcanvas/pcui/react';
import { useState } from 'react';

import { jsx } from '../jsx.mjs';
import { NumberField } from './NumberField.mjs';

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
            jsx('span', { title: state.activeTool === 'scale' ? 'Coordinate space: Local (Scale is locked to local space)' : `Coordinate space: ${effectiveSpace === 'world' ? 'World' : 'Local'} (~ / X to toggle)` }, effectiveSpace === 'world' ? 'World' : 'Local'),
            jsx('span', { className: 'viewport-separator' }),
            jsx('span', { className: state.snap.enabled ? 'snap-indicator is-enabled' : 'snap-indicator' }, `Snap ${state.snap.enabled ? 'On' : 'Off'}`),
            jsx('span', { className: 'viewport-chrome-spacer' }),
            jsx('label', { className: 'viewport-speed' }, 'Speed ', jsx(NumberField, {
                min: 0.1,
                max: 1000,
                label: 'Camera fly speed',
                value: Number(state.flySpeed.toFixed(2)),
                onCommit: speed => dispatch({ type: 'setFlySpeed', speed })
            })),
            jsx(Button, {
                class: 'viewport-help-button',
                text: '?',
                tooltip: 'Viewport navigation help',
                onClick: () => setShowHelp(current => !current)
            })
        ),
        showHelp && jsx('div', { className: 'viewport-help-card', role: 'dialog', 'aria-label': 'Viewport navigation help' },
            jsx('strong', null, 'UE-style perspective navigation'),
            jsx('p', null, 'Click LMB to select · drag LMB to move forward/back and turn · drag RMB to look'),
            jsx('p', null, 'LMB + RMB / MMB drag to pan · wheel to dolly · RMB + wheel to adjust fly speed'),
            jsx('p', null, 'Hold RMB + WASD / arrows to fly · E/Q move along world Z up/down'),
            jsx('p', null, 'Alt + drag a Move/Rotate handle to duplicate · otherwise Alt + LMB orbit · Alt + RMB dolly · Alt + MMB pan · F frame selection'),
            jsx('p', null, 'Q/W/E/R tools outside navigation · ~ / X toggle space · Shift+F frame all · Shift/Ctrl fast/slow fly')
        ),
        jsx('div', { className: 'viewport-hint' }, 'Hold RMB + WASD to fly · Q/W/E/R tools · ~ toggle space · F to frame')
    );
}
