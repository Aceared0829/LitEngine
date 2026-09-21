import { jsx } from '../jsx.mjs';

/**
 * @param {{ side: 'left'|'right', onResize: (width: number) => void, onReset: () => void }} props - Dock resize props.
 */
export function DockResizeHandle({ side, onResize, onReset }) {
    /** @param {import('react').PointerEvent<HTMLButtonElement>} event - Pointer start event. */
    const onPointerDown = (event) => {
        const startX = event.clientX;
        const startWidth = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
        event.currentTarget.setPointerCapture(event.pointerId);
        document.body.classList.add('editor-resizing');

        /** @param {PointerEvent} moveEvent - Pointer move event. */
        const onPointerMove = (moveEvent) => {
            const delta = moveEvent.clientX - startX;
            onResize(side === 'left' ? startWidth + delta : startWidth - delta);
        };
        const onPointerEnd = () => {
            document.body.classList.remove('editor-resizing');
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerEnd);
            window.removeEventListener('pointercancel', onPointerEnd);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerEnd);
        window.addEventListener('pointercancel', onPointerEnd);
    };

    return jsx('button', {
        type: 'button',
        className: `dock-resize-handle dock-resize-handle-${side}`,
        'aria-label': `Resize ${side === 'left' ? 'scene' : 'inspector'} panel`,
        title: 'Drag to resize. Double-click to reset.',
        onPointerDown,
        onDoubleClick: onReset,
        onKeyDown: (event) => {
            const delta = event.shiftKey ? 32 : 8;
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                onResize((event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0) - delta);
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                onResize((event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0) + delta);
            } else if (event.key === 'Home') {
                event.preventDefault();
                onReset();
            }
        }
    });
}
