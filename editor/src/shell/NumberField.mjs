import { useEffect, useRef, useState } from 'react';

import { jsx } from '../jsx.mjs';
import { parseNumberDraft } from './number-draft.mjs';

let nextGestureId = 0;

/**
 * Numeric input with a local draft; external synchronization never emits an edit.
 *
 * @param {{ value: number, label: string, onCommit: (value: number) => void, min?: number, max?: number, scrub?: { step: number, precision: number, onStart: (id: number) => void, onPreview: (id: number, value: number) => void, onEnd: (id: number) => void, onCancel: (id: number) => void } }} props - Input props.
 */
export function NumberField({ value, label, onCommit, min = -Infinity, max = Infinity, scrub }) {
    const [draft, setDraft] = useState(null);
    const [baseline, setBaseline] = useState(value);
    const gestureRef = useRef(null);
    const scrubRef = useRef(scrub);
    scrubRef.current = scrub;
    if (!Object.is(baseline, value)) {
        setBaseline(value);
        setDraft(null);
    }
    const commit = () => {
        if (draft === null) {
            return;
        }
        const parsed = parseNumberDraft(draft);
        setDraft(null);
        if (parsed !== null && parsed >= min && parsed <= max && parsed !== value) {
            onCommit(parsed);
        }
    };
    const finishGesture = (gesture, canceled) => {
        if (gestureRef.current !== gesture) {
            return;
        }
        gestureRef.current = null;
        window.removeEventListener('pointermove', gesture.move);
        window.removeEventListener('pointerup', gesture.up);
        window.removeEventListener('pointercancel', gesture.cancel);
        window.removeEventListener('blur', gesture.cancel);
        gesture.input.removeEventListener('lostpointercapture', gesture.cancel);
        if (gesture.started) {
            document.body.classList.remove('editor-scrubbing');
            if (canceled) {
                scrubRef.current?.onCancel(gesture.id);
            } else {
                scrubRef.current?.onEnd(gesture.id);
            }
        }
        if (gesture.input.hasPointerCapture?.(gesture.pointerId)) {
            gesture.input.releasePointerCapture(gesture.pointerId);
        }
    };
    useEffect(() => () => {
        if (gestureRef.current) {
            finishGesture(gestureRef.current, true);
        }
    }, []);

    const onPointerDown = (event) => {
        if (!scrub || draft !== null || event.button !== 0 || event.isPrimary === false ||
            (event.pointerType !== 'mouse' && event.pointerType !== 'pen') || gestureRef.current) {
            return;
        }
        // Keep native click-to-edit behavior until the pointer actually moves horizontally.
        const gesture = {
            id: ++nextGestureId,
            input: event.currentTarget,
            pointerId: event.pointerId,
            startX: event.clientX,
            startValue: value,
            started: false
        };
        gesture.move = (moveEvent) => {
            if (moveEvent.pointerId !== gesture.pointerId) {
                return;
            }
            const delta = moveEvent.clientX - gesture.startX;
            if (!gesture.started) {
                if (Math.abs(delta) < 4) {
                    return;
                }
                gesture.started = true;
                document.body.classList.add('editor-scrubbing');
                try {
                    gesture.input.setPointerCapture?.(gesture.pointerId);
                } catch {
                    // Window listeners still track a pointer that lost capture before the threshold.
                }
                if (gestureRef.current !== gesture) {
                    return;
                }
                scrubRef.current?.onStart(gesture.id);
            }
            const settings = scrubRef.current;
            if (settings) {
                const multiplier = 10 ** settings.precision;
                const nextValue = Math.round((gesture.startValue + delta * settings.step) * multiplier) / multiplier;
                settings.onPreview(gesture.id, Math.min(max, Math.max(min, nextValue)));
            }
        };
        gesture.up = (upEvent) => {
            if (upEvent.pointerId === gesture.pointerId) {
                if (gesture.started) {
                    gesture.move(upEvent);
                }
                finishGesture(gesture, false);
            }
        };
        gesture.cancel = () => finishGesture(gesture, true);
        gestureRef.current = gesture;
        window.addEventListener('pointermove', gesture.move);
        window.addEventListener('pointerup', gesture.up);
        window.addEventListener('pointercancel', gesture.cancel);
        window.addEventListener('blur', gesture.cancel);
        gesture.input.addEventListener('lostpointercapture', gesture.cancel);
    };
    const precision = scrub ? 10 ** scrub.precision : 1;
    const rounded = Math.round(value * precision) / precision;
    const displayValue = scrub && Math.abs(value - rounded) < 1e-6 ? rounded : value;
    return jsx('input', {
        type: 'text',
        inputMode: 'decimal',
        'aria-label': label,
        title: scrub ? 'Drag horizontally to adjust · click to type' : undefined,
        value: draft ?? String(displayValue),
        onChange: event => setDraft(event.target.value),
        onPointerDown,
        onBlur: commit,
        onKeyDown: (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                commit();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                if (gestureRef.current) {
                    finishGesture(gestureRef.current, true);
                }
                setDraft(null);
            }
        }
    });
}
