import { useState } from 'react';

import { jsx } from '../jsx.mjs';
import { parseNumberDraft } from './number-draft.mjs';

/**
 * Numeric input with a local draft; external synchronization never emits an edit.
 *
 * @param {{ value: number, label: string, onCommit: (value: number) => void, min?: number, max?: number }} props - Input props.
 */
export function NumberField({ value, label, onCommit, min = -Infinity, max = Infinity }) {
    const [draft, setDraft] = useState(null);
    const [baseline, setBaseline] = useState(value);
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
    return jsx('input', {
        type: 'text',
        inputMode: 'decimal',
        'aria-label': label,
        value: draft ?? String(value),
        onChange: event => setDraft(event.target.value),
        onBlur: commit,
        onKeyDown: (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                commit();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                setDraft(null);
            }
        }
    });
}
