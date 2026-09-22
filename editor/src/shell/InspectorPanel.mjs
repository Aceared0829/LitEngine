import { Button, Panel, VectorInput } from '@playcanvas/pcui/react';
import { useRef, useState } from 'react';

import { getSelectedEntity, isFiniteVector3 } from '../domain/editor-reducer.mjs';
import { jsx } from '../jsx.mjs';

/**
 * PCUI's React VectorInput emits change when React sets value, and retains its first onChange.
 * Only forward user edits, using the latest callback after the selected entity changes.
 *
 * @param {{ field: string, value: number[], onChange: (value: number[]) => void }} props - Vector field props.
 */
function TransformVectorInput({ field, value, onChange }) {
    const inputRef = useRef(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    return jsx(VectorInput, {
        ref: inputRef,
        class: ['transform-vector', `transform-vector-${field}`],
        dimensions: 3,
        value,
        onChange: (nextValue) => {
            if (!inputRef.current?.element?._suppressChange) {
                onChangeRef.current(nextValue);
            }
        }
    });
}

/**
 * @param {{ state: import('../domain/editor-reducer.mjs').EditorState, dispatch: (command: import('../contracts/editor-contracts.mjs').EditorCommand) => void, ready: boolean, collapsed: boolean }} props - Inspector props.
 */
export function InspectorPanel({ state, dispatch, ready, collapsed }) {
    const entity = getSelectedEntity(state);
    const [transformExpanded, setTransformExpanded] = useState(true);
    const selectionRef = useRef(null);
    const transformRef = useRef(null);
    selectionRef.current = entity?.id ?? null;
    transformRef.current = entity?.transform ?? null;

    if (collapsed) {
        return jsx(Panel, { class: ['editor-panel', 'inspector-panel'], headerText: 'Inspector' });
    }

    if (!entity) {
        return jsx(
            Panel,
            { class: ['editor-panel', 'inspector-panel'], headerText: 'Inspector' },
            jsx('p', { className: 'empty-selection' }, 'Select a scene entity to inspect its properties.')
        );
    }

    /**
     * @param {string} entityId - Entity being edited.
     * @param {'position'|'rotation'|'scale'} field - Transform field to update.
     * @param {number[]} value - New vector.
     */
    const updateTransform = (entityId, field, value) => {
        const current = transformRef.current;
        const vector = value.map(Number);
        if (selectionRef.current !== entityId || !current || !isFiniteVector3(vector) ||
            vector.every((component, index) => component === current[field][index])) {
            return;
        }
        const transform = { ...current, [field]: vector };
        transformRef.current = transform;
        dispatch({
            type: 'setTransform',
            entityId,
            label: `Edit ${field}`,
            transform
        });
    };

    const vector = (label, field, unit) => jsx(
        'div',
        { className: 'inspector-field', key: field },
        jsx('div', { className: 'inspector-field-heading' },
            jsx('span', { className: 'inspector-label' }, label),
            jsx('span', { className: 'inspector-unit' }, unit),
            jsx(Button, {
                class: 'field-reset-button',
                text: '↺',
                tooltip: `Reset ${label}`,
                disabled: !ready,
                onClick: () => {
                    if (selectionRef.current) {
                        dispatch({ type: 'resetTransformField', entityId: selectionRef.current, field });
                    }
                }
            })
        ),
        jsx(TransformVectorInput, {
            field,
            value: entity.transform[field],
            onChange: value => updateTransform(entity.id, field, value)
        })
    );

    return jsx(
        Panel,
        { class: ['editor-panel', 'inspector-panel'], headerText: 'Inspector' },
        jsx('section', { className: 'inspector-identity' },
            jsx('div', null,
                jsx('p', { className: 'inspector-kicker' }, 'Selected Entity'),
                jsx('h2', null, entity.name)
            ),
            jsx('span', { className: 'entity-chip' }, entity.type)
        ),
        jsx('section', { className: 'inspector-section transform-section' },
            jsx('button', {
                type: 'button',
                className: 'inspector-section-toggle',
                'aria-expanded': transformExpanded,
                onClick: () => setTransformExpanded(!transformExpanded)
            }, jsx('span', null, transformExpanded ? '⌄' : '›'), ' Transform'),
            transformExpanded && jsx('div', { className: 'transform-fields' },
                vector('Location', 'position', 'cm'),
                vector('Rotation', 'rotation', '°'),
                vector('Scale', 'scale', '×')
            )
        ),
        jsx('section', { className: 'inspector-section' },
            jsx('h3', null, 'Components'),
            jsx('p', { className: 'inspector-note' }, 'Read-only summary'),
            jsx('ul', { className: 'component-list' }, ...entity.components.map(component => jsx('li', { key: component }, component)))
        )
    );
}
