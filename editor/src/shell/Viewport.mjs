import { Button } from '@playcanvas/pcui/react';
import { useRef } from 'react';

import { jsx } from '../jsx.mjs';
import { NumberField } from './NumberField.mjs';

/**
 * @param {object} props - Viewport and its controls.
 * @param {import('react').RefObject<HTMLCanvasElement | null>} props.canvasRef - Canvas ref.
 * @param {import('../domain/editor-reducer.mjs').EditorState} props.state - Editor state.
 * @param {(command: import('../contracts/editor-contracts.mjs').EditorCommand) => void} props.dispatch - Command dispatcher.
 * @param {boolean} props.showHelp - Viewport help visibility.
 * @param {(visible: boolean) => void} props.setShowHelp - Set viewport help visibility.
 */
export function Viewport({ canvasRef, state, dispatch, showHelp, setShowHelp }) {
    const stateRef = useRef(state);
    stateRef.current = state;
    const effectiveSpace = state.activeTool === 'scale' ? 'local' : state.coordinateSpace;
    const ready = state.runtimeStatus === 'ready';
    const activeSnapTool = state.activeTool === 'select' ? 'translate' : state.activeTool;
    const increment = state.snap[`${activeSnapTool}Increment`];
    const toolButton = (name, label, shortcut) => jsx(Button, {
        class: ['viewport-tool-button', ...(state.activeTool === name ? ['is-active'] : [])],
        text: `${label} ${shortcut}`,
        tooltip: `${label} tool (${shortcut})`,
        disabled: !ready,
        onClick: () => dispatch({ type: 'setTransformTool', tool: name })
    });

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
            toolButton('select', 'Select', 'Q'),
            toolButton('translate', 'Move', 'W'),
            toolButton('rotate', 'Rotate', 'E'),
            toolButton('scale', 'Scale', 'R'),
            jsx('span', { className: 'viewport-separator' }),
            jsx(Button, {
                class: 'coordinate-space',
                text: effectiveSpace === 'world' ? 'World' : 'Local',
                tooltip: state.activeTool === 'scale' ? 'Scale uses local space' : 'Toggle world/local transform space (~ / X)',
                disabled: !ready || state.activeTool === 'scale',
                onClick: () => dispatch({ type: 'setCoordinateSpace', coordinateSpace: stateRef.current.coordinateSpace === 'world' ? 'local' : 'world' })
            }),
            jsx(Button, {
                class: ['snap-button', ...(state.snap.enabled ? ['is-active'] : [])],
                text: `Snap ${state.snap.enabled ? 'On' : 'Off'} · ${increment}`,
                tooltip: `Toggle transform snap (${activeSnapTool} increment ${increment})`,
                disabled: !ready,
                onClick: () => dispatch({ type: 'setSnapEnabled', enabled: !stateRef.current.snap.enabled })
            }),
            jsx(Button, { class: 'viewport-action', text: 'Frame · F', disabled: !ready, onClick: () => dispatch({ type: 'focusSelected' }) }),
            jsx(Button, { class: 'viewport-action', text: 'Frame All', disabled: !ready, onClick: () => dispatch({ type: 'frameAll' }) }),
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
